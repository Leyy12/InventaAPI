import { pathToFileURL } from 'node:url';
import { globalTestBillingConfiguration } from '../services/payment-contract.js';
import { EMAIL_DELIVERY_PROVIDERS, senderAddress, validSmtpHost, validSmtpPort } from '../services/email-delivery.js';

const NODE_MAJOR = 22;
const SCOPES = new Set(['all', 'backend', 'dashboard', 'admin']);
const MODES = new Set(['production', 'test']);
// Data identity labels (DATA_PROJECT_ID): "inventaapi-db" = production, "inventaapi-staging" = staging.
const DEPLOYMENT_DATA_PROJECTS = new Set(['inventaapi-db', 'inventaapi-staging']);
const supabaseOrigin = value => /^https:\/\/[a-z0-9]{20}\.supabase\.co$/u.test(value);
const supabasePublishableKey = value => /^sb_publishable_\S{10,}$/u.test(value) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/u.test(value);
const supabaseSecretKey = value => /^sb_secret_\S{10,}$/u.test(value) || /^eyJ[\w-]+\.[\w-]+\.[\w-]+$/u.test(value);

// A database on this machine (local tests), never a hosted one.
const loopbackDatabase = value => {
  try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(value).hostname); } catch { return false; }
};

const isPresent = value => typeof value === 'string' && value.trim().length > 0;
const noWhitespace = value => isPresent(value) && !/\s/u.test(value);
const notPlaceholder = value => !/(?:replace|placeholder|your[-_ ]?project)/iu.test(value);
const reservedMailDomain = address => /@(?:[^@]*\.)?(?:example\.(?:com|net|org)|[^@]+\.(?:example|invalid|test|localhost))$/iu.test(address);
const canonicalUtc = value => {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value || '')) return false;
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) && parsed.toISOString() === value;
};

export function validReleaseOrigin(value, mode) {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return false;
    // Canonical origins only: clients append fixed paths without URL resolution.
    if (value !== url.origin || url.search || url.hash || url.pathname !== '/') return false;
    if (mode === 'production') {
      if (url.protocol !== 'https:') return false;
      const hostname = url.hostname.replace(/\.$/u, '');
      if (['localhost', '0.0.0.0', '[::]', '[::1]'].includes(hostname)
        || hostname.endsWith('.localhost') || /^127\./u.test(hostname)) return false;
      if (/^(?:.*\.)?example\.(?:com|net|org)$/iu.test(hostname)
        || /\.(?:example|invalid|test)$/iu.test(hostname)) return false;
    }
    return true;
  } catch {
    return false;
  }
}

export function validateReleaseConfig(env, {
  scope = 'all', mode = 'production', nodeVersion = process.version, now = new Date(),
} = {}) {
  if (!SCOPES.has(scope)) throw new Error(`Unsupported scope: ${scope}`);
  if (!MODES.has(mode)) throw new Error(`Unsupported mode: ${mode}`);

  const errors = [];
  const warnings = [];
  const seen = new Set();
  const add = (target, code, name, message) => {
    const key = `${code}:${name}:${message}`;
    if (!seen.has(key)) target.push({ code, name, message });
    seen.add(key);
  };
  const required = (name, { secret = false, valid = isPresent, expectation = 'a non-empty value' } = {}) => {
    const value = env[name];
    if (!isPresent(value)) {
      add(errors, secret ? 'MISSING_SECRET' : 'MISSING_PUBLIC', name,
        secret ? 'required secret is missing' : 'required public configuration is missing');
    } else if (!valid(value)) {
      add(errors, secret ? 'MALFORMED_SECRET' : 'MALFORMED_PUBLIC', name,
        `${secret ? 'secret' : 'public configuration'} must be ${expectation}`);
    }
  };

  const nodeMajor = Number(/^v?(\d+)/u.exec(nodeVersion || '')?.[1]);
  if (nodeMajor !== NODE_MAJOR) {
    add(errors, 'RUNTIME', 'NODE_RUNTIME', `Node ${NODE_MAJOR}.x is required by the repository runtime contract`);
  }

  const backend = scope === 'all' || scope === 'backend';
  const dashboard = scope === 'all' || scope === 'dashboard';
  const admin = scope === 'all' || scope === 'admin';
  // Deployment checks never trust an escape flag. demo-* is confined to the
  // explicit local test mode with a database on this machine and no LIVE payments.
  const isolatedLocal = mode === 'test' && env.PAYMONGO_MODE !== 'live' && loopbackDatabase(env.SUPABASE_DB_URL);
  const authorizedProject = value => DEPLOYMENT_DATA_PROJECTS.has(value)
    || isolatedLocal && /^demo-[a-z0-9-]{1,24}[a-z0-9]$/u.test(value);
  if (backend || dashboard || admin) {
    if (mode === 'production' && loopbackDatabase(env.SUPABASE_DB_URL)) {
      add(errors, 'LOCAL_DATABASE_DEPLOYMENT', 'SUPABASE_DB_URL', 'a deployment cannot use a database on localhost');
    }
  }

  if (backend) {
    required('NODE_ENV', { valid: value => value === mode, expectation: mode });
    // Data, sign-in and photo storage are Supabase.
    required('SUPABASE_DB_URL', { secret: true, valid: value => /^postgres(?:ql)?:\/\/\S+$/u.test(value) && notPlaceholder(value),
      expectation: 'the Supabase Postgres connection string' });
    required('SUPABASE_URL', { valid: supabaseOrigin, expectation: 'the Supabase project URL (https://<ref>.supabase.co)' });
    required('SUPABASE_PUBLISHABLE_KEY', { valid: supabasePublishableKey, expectation: 'the Supabase publishable (or anon) key' });
    required('SUPABASE_SECRET_KEY', { secret: true, valid: value => supabaseSecretKey(value) && notPlaceholder(value),
      expectation: 'a Supabase secret (or service_role) key' });
    required('DATA_PROJECT_ID', { valid: authorizedProject,
      expectation: 'the data identity label: inventaapi-db (Production) or inventaapi-staging' });
    if (!isPresent(env.CRON_SECRET) || env.CRON_SECRET.length < 16) {
      add(warnings, 'OPTIONAL_MISSING', 'CRON_SECRET', 'not set (or under 16 characters); the daily subscription and Trial jobs stay off');
    }
    required('PAYMONGO_MODE', {
      valid: value => ['test', 'live'].includes(value), expectation: 'test or live',
    });
    if (env.DATA_PROJECT_ID === 'inventaapi-db' && env.PAYMONGO_MODE !== 'live') {
      add(errors, 'PAYMENT_MODE_ISOLATION', 'PAYMONGO_MODE', 'Production data requires LIVE payments.');
    }
    if (env.PAYMENT_CHECKOUT_INITIATION_HOLD !== undefined && !['true', 'false'].includes(env.PAYMENT_CHECKOUT_INITIATION_HOLD)) {
      add(errors, 'INVALID_CHECKOUT_HOLD', 'PAYMENT_CHECKOUT_INITIATION_HOLD', 'must be absent, true, or false');
    }
    try {
      if (globalTestBillingConfiguration({ mode: env.PAYMONGO_MODE,
        globalTestBilling: env.PAYMONGO_GLOBAL_TEST_BILLING,
        globalTestAmountCentavos: env.PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS })) {
        add(warnings, 'TEMPORARY_LIVE_BILLING', 'PAYMONGO_GLOBAL_TEST_BILLING',
          'ALL new Live Pro/Pro Max checkouts charge 500 centavos; canonical prices and entitlements remain unchanged');
      }
    } catch {
      add(errors, 'MALFORMED_PUBLIC', 'PAYMONGO_GLOBAL_TEST_BILLING',
        'must be absent/false, or exactly true with PAYMONGO_MODE=live and PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS=500');
    }
    required('PAYMONGO_SECRET_KEY', {
      secret: true,
      valid: value => ['test', 'live'].includes(env.PAYMONGO_MODE)
        && /^sk_(test|live)_\S+$/u.exec(value)?.[1] === env.PAYMONGO_MODE
        && notPlaceholder(value) && !/YOUR_/iu.test(value),
      expectation: 'a non-placeholder secret key matching PAYMONGO_MODE (sk_test_ or sk_live_)',
    });
    required('PAYMONGO_WEBHOOK_SECRET', {
      secret: true,
      valid: value => notPlaceholder(value),
      expectation: 'the non-placeholder signing secret for the matching webhook endpoint',
    });
    // New Customer accounts are created only after an emailed signup code is verified.
    required('EMAIL_DELIVERY_PROVIDER', {
      valid: value => EMAIL_DELIVERY_PROVIDERS.includes(value), expectation: 'resend or smtp',
    });
    required('EMAIL_FROM', {
      valid: value => !!senderAddress(value) && notPlaceholder(value) && !reservedMailDomain(senderAddress(value)),
      expectation: 'a non-placeholder sender ("Name <address>" or an address) the provider may send from',
    });
    if (env.EMAIL_DELIVERY_PROVIDER === 'resend') required('RESEND_API_KEY', {
      secret: true, valid: value => /^re_\S+$/u.test(value) && notPlaceholder(value),
      expectation: 'a non-placeholder Resend API key for the sender domain',
    });
    if (env.EMAIL_DELIVERY_PROVIDER === 'smtp') {
      required('SMTP_HOST', { valid: validSmtpHost, expectation: 'an SMTP server hostname' });
      if (isPresent(env.SMTP_PORT) && !validSmtpPort(env.SMTP_PORT)) {
        add(errors, 'MALFORMED_PUBLIC', 'SMTP_PORT', 'public configuration must be a TCP port number (465 for implicit TLS, or 587 with STARTTLS)');
      }
      required('SMTP_USER', {
        valid: value => noWhitespace(value) && notPlaceholder(value), expectation: 'the SMTP account user name',
      });
      required('SMTP_PASS', {
        secret: true, valid: value => notPlaceholder(value), expectation: 'a non-placeholder SMTP password or app password',
      });
    }
    for (const name of ['DASHBOARD_URL', 'NEXT_PUBLIC_APP_URL']) {
      required(name, { valid: value => validReleaseOrigin(value, mode), expectation: `a canonical ${mode === 'production' ? 'HTTPS, non-local' : 'HTTP(S)'} origin without path, trailing slash, query or fragment` });
    }
    if (isPresent(env.DASHBOARD_URL) && isPresent(env.NEXT_PUBLIC_APP_URL) && env.DASHBOARD_URL !== env.NEXT_PUBLIC_APP_URL) {
      add(errors, 'ORIGIN_MISMATCH', 'NEXT_PUBLIC_APP_URL', 'must match DASHBOARD_URL: both identify the Customer origin');
    }
    const apiPort = Number(env.API_PORT);
    if (isPresent(env.API_PORT)
      && (!/^\d+$/u.test(env.API_PORT) || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)) {
      add(errors, 'MALFORMED_PUBLIC', 'API_PORT', 'public configuration must be a TCP port number');
    }
    if (!isPresent(env.FREE_MONTHLY_QUOTA_CUTOVER_AT)) {
      add(warnings, 'OPTIONAL_MISSING', 'FREE_MONTHLY_QUOTA_CUTOVER_AT',
        'not set; Free accounts without an authoritative monthly counter enter a next-UTC-month hold');
    } else if (!canonicalUtc(env.FREE_MONTHLY_QUOTA_CUTOVER_AT)) {
      add(errors, 'MALFORMED_PUBLIC', 'FREE_MONTHLY_QUOTA_CUTOVER_AT',
        'must be a canonical UTC timestamp for the coordinated monthly-quota cutover, not the old daily cutover');
    } else if (new Date(env.FREE_MONTHLY_QUOTA_CUTOVER_AT) > now) {
      add(warnings, 'FUTURE_VALUE', 'FREE_MONTHLY_QUOTA_CUTOVER_AT',
        'monthly new-account exception remains inactive until this instant');
    }
    if (!isPresent(env.API_QUOTA_CUTOVER_AT)) {
      add(warnings, 'OPTIONAL_MISSING', 'API_QUOTA_CUTOVER_AT',
        'not set; ambiguous accounts will intentionally enter the fail-closed clean-window hold');
    } else if (!canonicalUtc(env.API_QUOTA_CUTOVER_AT)) {
      add(errors, 'MALFORMED_PUBLIC', 'API_QUOTA_CUTOVER_AT',
        'public configuration must be a canonical UTC timestamp (YYYY-MM-DDTHH:mm:ss.sssZ)');
    } else if (new Date(env.API_QUOTA_CUTOVER_AT) > now) {
      add(warnings, 'FUTURE_VALUE', 'API_QUOTA_CUTOVER_AT',
        'is scheduled in the future; the proven-new-account exception remains inactive until that instant');
    }
  }

  if (dashboard || admin) {
    required('NEXT_PUBLIC_API_URL', {
      valid: value => validReleaseOrigin(value, mode), expectation: `a canonical ${mode === 'production' ? 'HTTPS, non-local' : 'HTTP(S)'} backend origin`,
    });
    required('NEXT_PUBLIC_SUPABASE_URL', { valid: supabaseOrigin, expectation: 'the Supabase project URL (https://<ref>.supabase.co)' });
    required('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', { valid: supabasePublishableKey, expectation: 'the Supabase publishable (or anon) key' });
    for (const name of ['NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY']) {
      if (isPresent(env[name]) && /^sb_secret_/u.test(env[name])) add(errors, 'SECRET_IN_PUBLIC', name, 'must never be a secret key');
    }
  }

  if (dashboard) {
    required('NEXT_PUBLIC_ADMIN_APP_ORIGIN', {
      valid: value => validReleaseOrigin(value, mode), expectation: `a canonical ${mode === 'production' ? 'HTTPS, non-local' : 'HTTP(S)'} Admin origin`,
    });
  }

  return { ok: errors.length === 0, scope, mode, errors, warnings };
}

export function formatValidation(result) {
  const lines = [`Release configuration: scope=${result.scope}, mode=${result.mode}`];
  for (const issue of result.errors) lines.push(`[ERROR ${issue.code}] ${issue.name}: ${issue.message}`);
  for (const issue of result.warnings) lines.push(`[WARN ${issue.code}] ${issue.name}: ${issue.message}`);
  lines.push(result.ok ? 'RESULT: PASS' : `RESULT: FAIL (${result.errors.length} error(s))`);
  return lines.join('\n');
}

function parseArgs(argv) {
  const options = { scope: 'all', mode: 'production' };
  for (const arg of argv) {
    if (arg.startsWith('--scope=')) options.scope = arg.slice('--scope='.length);
    else if (arg.startsWith('--mode=')) options.mode = arg.slice('--mode='.length);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  return options;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  try {
    const result = validateReleaseConfig(process.env, parseArgs(process.argv.slice(2)));
    console.log(formatValidation(result));
    if (!result.ok) process.exitCode = 1;
  } catch (error) {
    console.error(`Release configuration validation failed: ${error.message}`);
    process.exitCode = 2;
  }
}
