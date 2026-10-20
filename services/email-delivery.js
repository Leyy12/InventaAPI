// Server-only transactional email (signup verification codes). Configuration is
// read from the environment; secrets never appear in errors or logs. No top-level
// dependencies: release validation imports the validators below during builds.
export const EMAIL_DELIVERY_PROVIDERS = Object.freeze(['resend', 'smtp']);

const mailbox = /^[^\s@<>"]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,63}$/u;
// "Name <address>" or a bare address. Line breaks are rejected (header injection).
export function senderAddress(value) {
  if (typeof value !== 'string' || value.length > 200 || /[\r\n]/u.test(value)) return null;
  const match = /^(?:(?:"[^"]{1,80}"|[^<>"]{1,80}) <([^<>\s]+)>|([^<>\s]+))$/u.exec(value.trim());
  const address = match?.[1] ?? match?.[2];
  return address && mailbox.test(address) ? address : null;
}
export const validSmtpHost = value => typeof value === 'string' && value.length <= 253
  && /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/u.test(value);
export const validSmtpPort = value => typeof value === 'string' && /^\d{1,5}$/u.test(value)
  && Number(value) >= 1 && Number(value) <= 65535;

// Unconfigured or invalid settings resolve to no provider, so sending fails closed.
// Printing codes to the server log is a development-only convenience.
export function emailDeliveryConfiguration(env = process.env) {
  const development = env.NODE_ENV === 'development';
  const provider = (env.EMAIL_DELIVERY_PROVIDER || '').trim() || (development ? 'console' : '');
  if (provider === 'console') return { provider: development ? 'console' : null };
  const from = (env.EMAIL_FROM || '').trim();
  if (!EMAIL_DELIVERY_PROVIDERS.includes(provider) || !senderAddress(from)) return { provider: null };
  if (provider === 'resend') {
    return /^re_\S+$/u.test(env.RESEND_API_KEY || '') ? { provider, from, apiKey: env.RESEND_API_KEY } : { provider: null };
  }
  const port = env.SMTP_PORT || '465';
  if (!validSmtpHost(env.SMTP_HOST) || !validSmtpPort(port) || !env.SMTP_USER?.trim() || !env.SMTP_PASS) return { provider: null };
  return { provider, from, host: env.SMTP_HOST, port: Number(port), user: env.SMTP_USER.trim(), pass: env.SMTP_PASS };
}

export function createEmailSender(env = process.env, { fetchImpl = globalThis.fetch,
  loadMailer = () => import('nodemailer'), log = console } = {}) {
  const config = emailDeliveryConfiguration(env);
  let transport;
  const deliver = {
    console: async message => { log.warn(`[Email] Development delivery to ${message.to}: ${message.subject}\n${message.text}`); },
    resend: async message => {
      const response = await fetchImpl('https://api.resend.com/emails', {
        method: 'POST', signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: config.from, to: [message.to], subject: message.subject, text: message.text, html: message.html }),
      });
      if (!response.ok) throw new Error(`Resend did not accept the email (HTTP ${response.status}).`);
    },
    smtp: async message => {
      // Port 465 is implicit TLS; any other port must upgrade with STARTTLS before AUTH.
      transport ??= (await loadMailer()).default.createTransport({ host: config.host, port: config.port,
        secure: config.port === 465, requireTLS: config.port !== 465, auth: { user: config.user, pass: config.pass },
        connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 20000 });
      await transport.sendMail({ from: config.from, to: message.to, subject: message.subject, text: message.text, html: message.html });
    },
  };
  const send = async message => {
    if (!config.provider) throw new Error('Email delivery is not configured.');
    await deliver[config.provider](message);
  };
  return Object.assign(send, { provider: config.provider });
}
