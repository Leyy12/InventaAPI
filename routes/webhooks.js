import express from 'express';
import { getDataStore } from '../database/data-store.js';
import { paymentConfiguration } from '../services/payment-contract.js';
import { createPaymentWebhook } from '../services/payment-webhook.js';
import { createCustomerNotifier, messages } from '../services/customer-notify.js';

const getConfig = () => paymentConfiguration({ mode: process.env.PAYMONGO_MODE, secretKey: process.env.PAYMONGO_SECRET_KEY,
  dataProjectId: getDataStore().projectId,
  webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET, nodeEnv: process.env.NODE_ENV });
// Preserve production startup failure on missing/misconfigured payment secrets.
if (process.env.NODE_ENV === 'production') getConfig();
const router = express.Router();
router.post('/paymongo', createPaymentWebhook({ getDb: () => getDataStore(), getConfig,
  report: issue => console.error('[PAYMENT WEBHOOK]', issue), notifier: createCustomerNotifier(), messages }));
export default router;
