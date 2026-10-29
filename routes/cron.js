import express from 'express';
import { timingSafeEqual } from 'node:crypto';
import { getDataStore } from '../database/data-store.js';
import { downgradeExpiredSubscriptions, sendTrialWarnings, sendPlanExpiryReminders } from '../services/scheduled-jobs.js';
import { createCustomerNotifier, messages } from '../services/customer-notify.js';
import { createEmailSender } from '../services/email-delivery.js';

// Scheduled jobs, run by Vercel Cron (vercel.json). Vercel sends
// "Authorization: Bearer <CRON_SECRET>"; without CRON_SECRET set, the jobs stay off.
// They run as Vercel cron jobs.
const router = express.Router();

function fromScheduler(req) {
  const secret = process.env.CRON_SECRET || '';
  const given = String(req.headers.authorization || '');
  const expected = `Bearer ${secret}`;
  return secret.length >= 16 && given.length === expected.length && timingSafeEqual(Buffer.from(given), Buffer.from(expected));
}
const job = run => async (req, res) => {
  if (!fromScheduler(req)) return res.status(401).json({ error: 'Scheduler authorization required.' });
  try { return res.json({ success: true, ...(await run()) }); }
  catch (error) {
    console.error('[CRON]', req.path, error.message);
    return res.status(500).json({ error: 'Scheduled job failed; it runs again on the next schedule.' });
  }
};

router.get('/subscriptions', job(() => downgradeExpiredSubscriptions(getDataStore())));

router.get('/trial-warnings', job(async () => {
  const send = createEmailSender();
  // Also remind paid customers whose plan ends within 3 days.
  const plans = await sendPlanExpiryReminders(getDataStore(), { notify: createCustomerNotifier({ sendEmail: send }).notify, messages })
    .catch(error => ({ planReminderError: error.message }));
  const trials = await sendTrialWarnings(getDataStore(), { from: process.env.EMAIL_FROM || 'InventaAPI',
    // The app's own email setup (SMTP); the frozen idempotency key is the delivery reference.
    sendEmail: async (payload, idempotencyKey) => {
      await send({ to: payload.to[0], subject: payload.subject, text: payload.text });
      return `email:${idempotencyKey}`;
    } });
  return { ...trials, plans };
}));

export default router;
