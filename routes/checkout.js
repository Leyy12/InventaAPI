import express from 'express';
import { getAuth } from '../services/supabase-auth.js';
import { getDataStore } from '../database/data-store.js';
import { createPaymentHandlers } from '../services/payment-checkout.js';
import { createPaymongoCheckout, expirePaymongoCheckout } from '../services/paymongo-checkout.js';
import { paymentConfiguration } from '../services/payment-contract.js';

const router = express.Router();
const handlers = createPaymentHandlers({
  getDb: () => getDataStore(),
  verifyIdToken: (token, checkRevoked) => getAuth().verifyIdToken(token, checkRevoked),
  getConfig: () => paymentConfiguration({ mode: process.env.PAYMONGO_MODE, secretKey: process.env.PAYMONGO_SECRET_KEY,
    dataProjectId: getDataStore().projectId, checkoutInitiationHold: process.env.PAYMENT_CHECKOUT_INITIATION_HOLD,
    webhookSecret: process.env.PAYMONGO_WEBHOOK_SECRET, nodeEnv: process.env.NODE_ENV,
    globalTestBilling: process.env.PAYMONGO_GLOBAL_TEST_BILLING,
    globalTestAmountCentavos: process.env.PAYMONGO_GLOBAL_TEST_AMOUNT_CENTAVOS,
    dashboardUrl: process.env.DASHBOARD_URL || 'http://localhost:3000' }),
  createSession: args => createPaymongoCheckout({ ...args, request: globalThis.fetch }),
  expireSession: args => expirePaymongoCheckout({ ...args, request: globalThis.fetch }),
  report: issue => console.error('[PAYMENT CHECKOUT]', issue),
});
router.post('/create-gcash', handlers.checkout);
router.get('/subscription-status', handlers.status);
export default router;
