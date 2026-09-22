import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createPaymentHandlers } from '../services/payment-checkout.js';
import { createPaymongoCheckout } from '../services/paymongo-checkout.js';
import { paymentConfiguration } from '../services/payment-contract.js';

const router = express.Router();
const handlers = createPaymentHandlers({
  getDb: () => getFirestore(),
  verifyIdToken: (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked),
  getConfig: () => paymentConfiguration({ mode: process.env.PAYMONGO_MODE, secretKey: process.env.PAYMONGO_SECRET_KEY,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET, nodeEnv: process.env.NODE_ENV,
    dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000' }),
  createSession: args => createPaymongoCheckout({ ...args, request: globalThis.fetch }),
  report: issue => console.error('[PAYMENT CHECKOUT]', issue),
});
router.post('/create-gcash', handlers.checkout);
router.get('/subscription-status', handlers.status);
export default router;
