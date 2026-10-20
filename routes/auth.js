import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { createIpRateLimiter } from '../services/rate-limit-client-ip.js';
import { createEmailSender } from '../services/email-delivery.js';
import { createEmailVerificationHandlers, createPasswordResetHandlers } from '../services/email-verification.js';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// No re-initialization needed here — getAuth() can be imported and used directly when needed.

const router = express.Router();

// NOTE: Token bridge endpoint removed - admin panel now uses direct Firebase authentication
// If you need to restore the token bridge functionality in the future, check git history

// Signup email verification and password reset codes. Admin SDK calls stay lazy so
// loading routes never touches Firebase.
const sendEmail = createEmailSender();
const accountByEmail = email => getAuth().getUserByEmail(email).catch(error => {
  if (error?.code === 'auth/user-not-found') return null;
  throw error;
});
const verification = createEmailVerificationHandlers({
  getDb: () => getFirestore(),
  emailRegistered: async email => !!await accountByEmail(email),
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  markEmailVerified: uid => getAuth().updateUser(uid, { emailVerified: true }),
  sendEmail,
});
const passwordReset = createPasswordResetHandlers({
  getDb: () => getFirestore(),
  findAccount: async email => {
    const account = await accountByEmail(email);
    return account && !account.disabled ? account.uid : null;
  },
  // Entering the emailed code also proves the address belongs to the account holder.
  setPassword: (uid, password) => getAuth().updateUser(uid, { password, emailVerified: true }),
  revokeSessions: uid => getAuth().revokeRefreshTokens(uid),
  sendEmail,
});
// Process-local per-IP bound on outbound email, shared by both code types, on top of
// the per-address limits in Firestore.
const { verifyClientIp, limiter } = createIpRateLimiter({ windowMs: 15 * 60 * 1000, max: 10,
  message: 'Too many verification emails were requested from this network. Please try again in 15 minutes.' });
router.post('/email-verification/send', verifyClientIp, limiter, verification.send);
router.post('/email-verification/verify', verification.verify);
router.post('/email-verification/confirm', verification.confirm);
router.post('/password-reset/send', verifyClientIp, limiter, passwordReset.send);
router.post('/password-reset/confirm', passwordReset.confirm);

export default router;
