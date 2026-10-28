import express from 'express';
import { getAuth } from '../services/supabase-auth.js';
import { getDataStore } from '../database/data-store.js';
import { createIpRateLimiter } from '../services/rate-limit-client-ip.js';
import { createEmailSender } from '../services/email-delivery.js';
import { createEmailVerificationHandlers, createPasswordResetHandlers } from '../services/email-verification.js';

// Sign-in accounts live in Supabase Auth (services/supabase-auth.js).

const router = express.Router();

// Signup email verification and password reset codes. Auth calls stay lazy so
// loading routes never contacts Supabase.
const sendEmail = createEmailSender();
const accountByEmail = email => getAuth().getUserByEmail(email).catch(error => {
  if (error?.code === 'auth/user-not-found') return null;
  throw error;
});
// An Auth identity without a users/{uid} profile is a signup that never finished
// (every completed account, admins included, has a profile).
const profileExists = async uid => (await getDataStore().collection('users').doc(uid).get()).exists;
const verification = createEmailVerificationHandlers({
  getDb: () => getDataStore(),
  emailRegistered: async email => {
    const account = await accountByEmail(email);
    return !!account && await profileExists(account.uid);
  },
  removeIncompleteAccount: async email => {
    const account = await accountByEmail(email);
    if (!account) return true;
    if (await profileExists(account.uid)) return false;
    await getAuth().deleteUser(account.uid).catch(error => { if (error?.code !== 'auth/user-not-found') throw error; });
    return true;
  },
  verifyIdToken: (token, revoked) => getAuth().verifyIdToken(token, revoked),
  markEmailVerified: uid => getAuth().updateUser(uid, { emailVerified: true }),
  createAccount: ({ email, password }) => getAuth().createUser({ email, password, emailVerified: true }),
  sendEmail,
});
const passwordReset = createPasswordResetHandlers({
  getDb: () => getDataStore(),
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
// the per-address limits in the database.
const { verifyClientIp, limiter } = createIpRateLimiter({ windowMs: 15 * 60 * 1000, max: 10,
  message: 'Too many verification emails were requested from this network. Please try again in 15 minutes.' });
router.post('/email-verification/send', verifyClientIp, limiter, verification.send);
router.post('/email-verification/verify', verification.verify);
router.post('/email-verification/confirm', verification.confirm);
router.post('/email-verification/reclaim', verification.reclaim);
router.post('/email-verification/register', verification.register);
router.post('/password-reset/send', verifyClientIp, limiter, passwordReset.send);
router.post('/password-reset/confirm', passwordReset.confirm);

export default router;
