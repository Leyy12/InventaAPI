import { pathToFileURL } from 'node:url';

const NODE_MAJOR = 22;
const SCOPES = new Set(['all', 'backend', 'dashboard', 'admin', 'functions']);
const MODES = new Set(['production', 'test']);

const isPresent = value => typeof value === 'string' && value.trim().length > 0;
const noWhitespace = value => isPresent(value) && !/\s/u.test(value);
const notPlaceholder = value => !/(?:replace|placeholder|your[-_ ]?project)/iu.test(value);
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

  if (backend) {
    required('NODE_ENV', { valid: value => value === mode, expectation: mode });
    required('FIREBASE_AUTH_MODE', {
      valid: value => ['service_account_env', 'application_default'].includes(value),
      expectation: 'service_account_env or application_default',
    });
    if (env.FIREBASE_AUTH_MODE === 'service_account_env') {
      required('FIREBASE_PROJECT_ID', {
        valid: value => /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(value) && notPlaceholder(value),
        expectation: 'a non-placeholder Firebase project ID',
      });
      required('FIREBASE_CLIENT_EMAIL', {
        valid: value => /^[^\s@]+@[^\s@]+\.iam\.gserviceaccount\.com$/u.test(value),
        expectation: 'a service-account email address',
      });
      required('FIREBASE_PRIVATE_KEY', {
        secret: true,
        valid: value => {
          const normalized = value.replace(/\\n/gu, '\n');
          return normalized.includes('-----BEGIN PRIVATE KEY-----')
            && normalized.includes('-----END PRIVATE KEY-----') && notPlaceholder(normalized);
        },
        expectation: 'a PEM private key',
      });
    } else if (env.FIREBASE_AUTH_MODE === 'application_default') {
      add(errors, 'UNSUPPORTED_AUTH_MODE', 'FIREBASE_AUTH_MODE',
        'root backend currently implements service_account_env only; managed identity is supported by Functions, not this initializer');
      for (const name of ['FIREBASE_PROJECT_ID', 'FIREBASE_CLIENT_EMAIL', 'FIREBASE_PRIVATE_KEY']) {
        if (isPresent(env[name])) add(errors, name === 'FIREBASE_PRIVATE_KEY' ? 'MALFORMED_SECRET' : 'MALFORMED_PUBLIC', name,
          'must be omitted when FIREBASE_AUTH_MODE=application_default; use the managed runtime identity');
      }
    }
    required('PAYMONGO_SECRET_KEY', {
      secret: true,
      valid: value => value.startsWith(mode === 'production' ? 'sk_live_' : 'sk_test_')
        && value.length > 'sk_live_'.length && notPlaceholder(value),
      expectation: mode === 'production' ? 'a live secret key' : 'a test secret key',
    });
    required('PAYMONGO_WEBHOOK_SECRET', {
      secret: true,
      valid: value => notPlaceholder(value),
      expectation: 'the non-placeholder signing secret for the matching webhook endpoint',
    });
    for (const name of ['DASHBOARD_URL', 'NEXT_PUBLIC_APP_URL']) {
      required(name, { valid: value => validReleaseOrigin(value, mode), expectation: `a canonical ${mode === 'production' ? 'HTTPS, non-local' : 'HTTP(S)'} origin without path, trailing slash, query or fragment` });
    }
    if (isPresent(env.DASHBOARD_URL) && isPresent(env.NEXT_PUBLIC_APP_URL) && env.DASHBOARD_URL !== env.NEXT_PUBLIC_APP_URL) {
      add(errors, 'ORIGIN_MISMATCH', 'NEXT_PUBLIC_APP_URL', 'must match DASHBOARD_URL: both identify the Customer origin');
    }
    required('TZ', { valid: value => {
      if (value !== 'UTC' && !/^[A-Za-z_]+\/[A-Za-z_]+(?:\/[A-Za-z_]+)?$/u.test(value)) return false;
      try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; }
    }, expectation: 'UTC or an explicit supported IANA timezone chosen for the existing subscription calendar behavior' });
    const apiPort = Number(env.API_PORT);
    if (isPresent(env.API_PORT)
      && (!/^\d+$/u.test(env.API_PORT) || !Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535)) {
      add(errors, 'MALFORMED_PUBLIC', 'API_PORT', 'public configuration must be a TCP port number');
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
    required('NEXT_PUBLIC_FIREBASE_API_KEY', {
      valid: value => noWhitespace(value) && value.length >= 20 && notPlaceholder(value),
      expectation: 'a non-placeholder Firebase web API key',
    });
    required('NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN', {
      valid: value => /^[A-Za-z0-9.-]+$/u.test(value) && value.includes('.'), expectation: 'a hostname without a URL path',
    });
    required('NEXT_PUBLIC_FIREBASE_PROJECT_ID', {
      valid: value => /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/u.test(value) && notPlaceholder(value),
      expectation: 'a non-placeholder Firebase project ID',
    });
    // URL-only product images do not require Storage. Validate an optional value
    // without making bucket configuration or uploads a release prerequisite.
    if (env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET !== undefined && env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET !== '') required('NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET', {
      valid: value => /^[A-Za-z0-9.-]+$/u.test(value) && value.includes('.'), expectation: 'a Storage bucket hostname',
    });
    required('NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID', {
      valid: value => /^\d+$/u.test(value), expectation: 'a numeric Firebase sender ID',
    });
    required('NEXT_PUBLIC_FIREBASE_APP_ID', {
      valid: value => /^\d+:\d+:web:[A-Za-z0-9]+$/u.test(value), expectation: 'a Firebase web app ID',
    });
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
