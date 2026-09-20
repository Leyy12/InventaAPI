import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';
import { paymentConfiguration } from '../services/payment-contract.js';
import { createPaymentWebhook } from '../services/payment-webhook.js';

const getConfig = () => paymentConfiguration({ secretKey: process.env.PAYMONGO_SECRET_KEY,
  webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET, nodeEnv: process.env.NODE_ENV });
// Preserve production startup failure on missing/misconfigured payment secrets.
if (process.env.NODE_ENV === 'production') getConfig();
const router = express.Router();
router.post('/paymongo', createPaymentWebhook({ getDb: () => getFirestore(), getConfig,
  report: issue => console.error('[PAYMENT WEBHOOK]', issue) }));
export default router;
