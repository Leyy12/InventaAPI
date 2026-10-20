// Shared by the Customer signup page and the backend verifier. Pure: no I/O.
export const VERIFICATION_CODE_TTL_SECONDS = 10 * 60;
export const VERIFICATION_RESEND_SECONDS = 60;
export const VERIFICATION_MAX_ATTEMPTS = 5;

// Firebase Auth treats addresses case-insensitively; one canonical form keeps the
// verified address, the Auth identity and the profile email identical.
export const normalizeSignupEmail = value => typeof value === 'string' ? value.trim().toLowerCase() : '';
// Conservative ASCII grammar for normalized input; delivery of the code proves the rest.
export const validSignupEmail = value => typeof value === 'string' && value.length <= 254
  && /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/u.test(value);
export const validVerificationCode = value => typeof value === 'string' && /^\d{6}$/u.test(value);
