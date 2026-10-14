import { REGISTRATION_MESSAGE } from './system-settings-contract.mjs';

export async function readRegistrationPolicy(request = globalThis.fetch) {
  const response = await request('/api/v1/system/status', { cache: 'no-store', signal: AbortSignal.timeout(15000) });
  if (!response.ok) throw new Error('Registration policy unavailable');
  const body = await response.json();
  if (body.success !== true || typeof body.allowNewRegistrations !== 'boolean') throw new Error('Registration policy unavailable');
  return body.allowNewRegistrations;
}

// Firebase Auth creation is not a completed InventaAPI registration. The
// authoritative Firestore rule evaluates server-owned settings at profile commit.
export async function completeCustomerSignup({ canRegister, createUser, writeProfile, profileExists, deleteUser, signOut }) {
  try { if (!await canRegister()) return { ok: false, message: REGISTRATION_MESSAGE }; }
  catch { return { ok: false, message: 'Registration availability could not be verified. Please try again later.' }; }
  let user;
  try { user = await createUser(); } catch (error) {
    return { ok: false, message: error?.code === 'auth/email-already-in-use'
      ? 'This email is already registered. Please sign in.' : 'Unable to create your account. Please try again later.' };
  }
  let committed = false, unavailable = false, cleanupVerified = true;
  try { await writeProfile(user); committed = true; } catch {
    try {
      committed = await profileExists(user);
      // A failed/uncertain response may follow a successful commit. Never delete
      // its Auth identity. Cleanup only this newly-created user's missing profile.
      if (!committed) { try { await deleteUser(user); } catch { cleanupVerified = false; } }
    } catch { cleanupVerified = false; }
    try { unavailable = !await canRegister(); } catch { /* retain generic unavailable message */ }
  }
  try { await signOut(); } catch {
    return { ok: false, message: 'Your session could not be closed. Sign out before continuing; do not create another account.' };
  }
  if (committed) return { ok: true, message: '' };
  return { ok: false, message: !cleanupVerified
    ? 'Account setup could not be verified. Please contact support before trying again.'
    : unavailable ? REGISTRATION_MESSAGE : 'Account setup could not be completed. Please try again later.' };
}
