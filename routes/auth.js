import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createIpRateLimiter } from '../services/rate-limit-client-ip.js';
import { createEmailSender } from '../services/email-delivery.js';
import { createEmailVerificationHandlers } from '../services/email-verification.js';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// No re-initialization needed here — getAuth() can be imported and used directly when needed.

const router = express.Router();

// NOTE: Token bridge endpoint removed - admin panel now uses direct Firebase authentication
// If you need to restore the token bridge functionality in the future, check git history

// Signup email verification. Admin SDK calls stay lazy so loading routes never touches Firebase.
const verification = createEmailVerificationHandlers({
  getDb: () => getFirestore(),
  emailRegistered: email => getAuth().getUserByEmail(email).then(() => true, error => {
    if (error?.code === 'auth/user-not-found') return false;
    throw error;
  }),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  markEmailVerified: uid => getAuth().updateUser(uid, { emailVerified: true }),
  sendEmail: createEmailSender(),
});
// Process-local per-IP bound on outbound email, on top of the per-address limits in Firestore.
const { verifyClientIp, limiter } = createIpRateLimiter({ windowMs: 15 * 60 * 1000, max: 10,
  message: 'Too many verification emails were requested from this network. Please try again in 15 minutes.' });
router.post('/email-verification/send', verifyClientIp, limiter, verification.send);
router.post('/email-verification/verify', verification.verify);
router.post('/email-verification/confirm', verification.confirm);

export default router;
