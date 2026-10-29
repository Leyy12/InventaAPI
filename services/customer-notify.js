// Customer notifications: one in-app notification (the bell) plus the same
// message by email. Email is best effort: a failed or unconfigured email never
// undoes the action that triggered it, and the in-app notification still appears.
import { createEmailSender } from './email-delivery.js';

const validEmail = value => typeof value === 'string' && /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/u.test(value.trim());
const SITE = 'https://inventaapi.shop';

export function emailText(body) {
  return `${body}\n\nOpen your account: ${SITE}/dashboard\n\n— InventaAPI\nYou are receiving this because you have an InventaAPI account.`;
}

// sendEmail({ to, subject, text }) defaults to the app's configured email (SMTP / Resend).
export function createCustomerNotifier({ sendEmail, now = () => new Date(), log = console } = {}) {
  let sender = sendEmail;
  const send = message => (sender ??= createEmailSender())(message);
  // id makes a notification idempotent: if it already exists nothing is sent again.
  async function notify(db, { userId, email, type, title, body, id, meta }) {
    const notifications = db.collection('notifications');
    const ref = id ? notifications.doc(id) : null;
    if (ref && (await ref.get()).exists) return { created: false };
    const record = { userId, type, title, body, read: false, createdAt: now(), ...(meta ? { meta } : {}) };
    if (ref) await ref.set(record); else await notifications.add(record);
    if (!validEmail(email)) return { created: true, emailed: false };
    try {
      await send({ to: email.trim(), subject: `InventaAPI: ${title}`, text: emailText(body) });
      return { created: true, emailed: true };
    } catch (error) {
      log.warn?.(`[Notify] Email for ${type} was not sent: ${error.message}`);
      return { created: true, emailed: false };
    }
  }
  // Email only (no bell), e.g. extra admins after the shared admin notification.
  async function emailOnly(email, title, body) {
    if (!validEmail(email)) return false;
    try { await send({ to: email.trim(), subject: `InventaAPI: ${title}`, text: emailText(body) }); return true; }
    catch (error) { log.warn?.(`[Notify] Email was not sent: ${error.message}`); return false; }
  }
  // Many customers at once (maintenance): a few emails in parallel, bounded in time.
  async function notifyMany(db, recipients, message, { concurrency = 5, timeoutMs = 8000 } = {}) {
    const queue = [...recipients];
    let sent = 0;
    const worker = async () => {
      while (queue.length) {
        const recipient = queue.shift();
        try { if ((await notify(db, { ...message(recipient), userId: recipient.id, email: recipient.email })).emailed) sent++; }
        catch (error) { log.warn?.(`[Notify] Notification failed: ${error.message}`); }
      }
    };
    await Promise.race([Promise.all(Array.from({ length: concurrency }, worker)),
      new Promise(resolve => setTimeout(resolve, timeoutMs))]);
    return { recipients: recipients.length, emailed: sent };
  }
  return { notify, notifyMany, emailOnly };
}

const day = iso => new Date(iso).toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'Asia/Manila' });
const time = iso => new Date(iso).toLocaleString('en-US', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

export const messages = {
  paymentReceived: (plan, expiresAt) => ({ type: 'subscription_active',
    title: `Your ${plan} plan is active`,
    body: `Thank you for subscribing! Your payment was received and your ${plan} plan is now active until ${day(expiresAt)}.` }),
  planExpiring: (plan, expiresAt) => ({ type: 'subscription_expiring',
    title: `Your ${plan} plan ends soon`,
    body: `Your ${plan} plan ends on ${day(expiresAt)}. Renew from Plan & Billing to keep your API keys working without interruption.` }),
  productsAdded: results => {
    const created = results.filter(result => result.created);
    const added = results.reduce((sum, result) => sum + result.added, 0);
    const keys = results.map(result => `${result.name || `${result.segment} API key`} (${result.total} products)`).join(', ');
    return { type: 'api_key_updated',
      title: created.length ? `New API key created` : `Products added to your API key`,
      body: `${added} ${added === 1 ? 'product was' : 'products were'} added. ${created.length ? `New key${created.length > 1 ? 's' : ''}: ${created.map(r => r.name).join(', ')}. ` : ''}Your keys: ${keys}.` };
  },
  keyCreated: name => ({ type: 'api_key_updated', title: 'New API key created',
    body: `Your API key "${name}" was created. Copy it from API Keys and store it securely.` }),
  // Admin side: a customer subscribed.
  adminNewSubscription: (customer, plan, expiresAt) => ({ type: 'subscription_purchased',
    title: `New ${plan} subscription`,
    body: `${customer.businessName || customer.fullName || 'A customer'} (${customer.email || 'no email'}) subscribed to ${plan}. Active until ${day(expiresAt)}.` }),
  maintenanceScheduled: (startsAt, endsAt) => ({ type: 'maintenance_scheduled',
    title: 'Scheduled maintenance',
    body: `InventaAPI will be under maintenance from ${time(startsAt)} to ${time(endsAt)} (Philippine time). You will be signed out during this time and can sign in again after it ends. Your API keys keep working. We're sorry for the inconvenience.` }),
};
