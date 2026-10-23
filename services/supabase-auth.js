// Sign-in for the API, backed by Supabase Auth. It offers the small part of the
// Firebase Admin Auth interface this codebase uses (verifyIdToken, getUserByEmail,
// createUser, updateUser, deleteUser, revokeRefreshTokens) with the same results and
// the same error codes, so routes only change where getAuth() comes from.
//
// Account ids: an account carried over from Firebase keeps its old id in
// app_metadata.legacy_uid, so every record filed under it (users/{uid}, API keys,
// history) stays attached. New accounts use their Supabase id.
//
// Configuration: SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY (checking sign-in tokens),
// SUPABASE_SECRET_KEY (account changes) and SUPABASE_DB_URL (look-ups by email or
// id and signing out everywhere, which the admin API does not offer).
import pg from 'pg';

const authError = (code, message) => Object.assign(new Error(message), { code });
const TOKEN_CACHE_MS = 30000, TOKEN_CACHE_MAX = 1000;

export const appUid = user => user?.app_metadata?.legacy_uid || user?.id;
function account(user) {
  return { uid: appUid(user), supabaseId: user.id, email: user.email || '', emailVerified: !!user.email_confirmed_at,
    disabled: !!(user.banned_until && Date.parse(user.banned_until) > Date.now()) };
}

export function createSupabaseAuth({ url, publishableKey, secretKey, query, findProfileByEmail, request = globalThis.fetch, now = () => Date.now() }) {
  const base = String(url || '').replace(/\/+$/u, '');
  const configured = () => {
    if (!base || !publishableKey || !secretKey) throw authError('auth/internal-error', 'Supabase Auth is not configured.');
  };
  const call = async (path, { method = 'GET', key = secretKey, token, body } = {}) => {
    configured();
    // New-style keys go on the apikey header only; a user's own token on Authorization.
    const headers = { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) };
    const response = await request(`${base}/auth/v1${path}`, { method, headers, body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = null; }
    return { status: response.status, data };
  };
  const failure = (status, data) => {
    const reason = `${data?.error_code || data?.code || ''} ${data?.msg || data?.message || data?.error_description || ''}`;
    if (status === 404 || /user_not_found/u.test(reason)) return authError('auth/user-not-found', 'No account for this user.');
    if (/email_exists|already been registered|already registered/iu.test(reason)) return authError('auth/email-already-exists', 'This email is already registered.');
    if (/weak_password|password/iu.test(reason) && status === 422) return authError('auth/invalid-password', 'That password cannot be used.');
    return authError('auth/internal-error', `Supabase Auth request failed (${status}).`);
  };

  // Look-ups by email or app id read Supabase's own user table.
  const columns = `id::text as id, email, email_confirmed_at, banned_until, raw_app_meta_data as app_metadata`;
  const findByEmail = async email => (await query(`select ${columns} from auth.users
      where lower(email) = lower($1) and deleted_at is null limit 1`, [String(email || '')])).rows[0] || null;
  const findByUid = async uid => (await query(`select ${columns} from auth.users
      where (raw_app_meta_data->>'legacy_uid' = $1 or id::text = $1) and deleted_at is null
      order by (raw_app_meta_data->>'legacy_uid' = $1) desc limit 1`, [String(uid || '')])).rows[0] || null;
  const requireUser = async uid => {
    const user = await findByUid(uid);
    if (!user) throw authError('auth/user-not-found', 'No account for this user.');
    return user;
  };

  const cache = new Map();
  async function verifyIdToken(token) {
    if (typeof token !== 'string' || !token || token.length > 8192) throw authError('auth/argument-error', 'Invalid sign-in token.');
    const hit = cache.get(token);
    if (hit && hit.until > now()) return hit.claims;
    // Supabase checks the signature, expiry and that the session was not signed out.
    const { status, data } = await call('/user', { key: publishableKey, token });
    if (status !== 200 || !data?.id) throw authError('auth/id-token-revoked', 'Invalid or expired session.');
    const user = account(data);
    if (user.disabled) throw authError('auth/user-disabled', 'This account is disabled.');
    const claims = { uid: user.uid, sub: user.uid, email: user.email, email_verified: user.emailVerified, supabase_id: user.supabaseId };
    if (cache.size >= TOKEN_CACHE_MAX) cache.clear();
    cache.set(token, { claims, until: now() + TOKEN_CACHE_MS });
    return claims;
  }

  async function createUser({ email, password, emailVerified = false, uid }) {
    const { status, data } = await call('/admin/users', { method: 'POST', body: { email, ...(password ? { password } : {}),
      email_confirm: !!emailVerified, ...(uid ? { app_metadata: { legacy_uid: uid } } : {}) } });
    if (status !== 200 && status !== 201) throw failure(status, data);
    return account(data);
  }

  // A person with a profile from before the move to Supabase has no Supabase account
  // yet. Looking them up by email creates it (email confirmed, no password); they set a
  // password with the "Forgot password" code, which is how every existing user moves.
  async function getUserByEmail(email) {
    const found = await findByEmail(email);
    if (found) return account(found);
    const profile = findProfileByEmail ? await findProfileByEmail(email) : null;
    if (!profile) throw authError('auth/user-not-found', 'No account for this email.');
    try { return await createUser({ email: profile.email || email, emailVerified: true, uid: profile.uid }); }
    catch (error) {
      if (error.code !== 'auth/email-already-exists') throw error;
      return account(await findByEmail(email));
    }
  }

  async function updateUser(uid, { password, emailVerified } = {}) {
    const user = await requireUser(uid);
    const body = { ...(password !== undefined ? { password } : {}), ...(emailVerified ? { email_confirm: true } : {}) };
    const { status, data } = await call(`/admin/users/${user.id}`, { method: 'PUT', body });
    if (status !== 200) throw failure(status, data);
    return account(data);
  }

  async function deleteUser(uid) {
    const user = await requireUser(uid);
    const { status, data } = await call(`/admin/users/${user.id}`, { method: 'DELETE' });
    if (status !== 200 && status !== 204) throw failure(status, data);
    for (const [token, entry] of cache) if (entry.claims.supabase_id === user.id) cache.delete(token);
  }

  // Signs the account out everywhere: its sessions (and their refresh tokens) are removed.
  async function revokeRefreshTokens(uid) {
    const user = await requireUser(uid);
    await query('delete from auth.sessions where user_id = $1::uuid', [user.id]);
    for (const [token, entry] of cache) if (entry.claims.supabase_id === user.id) cache.delete(token);
  }

  return { verifyIdToken, getUserByEmail, createUser, updateUser, deleteUser, revokeRefreshTokens };
}

// One shared instance for the API, configured from the environment on first use.
let shared, pool;
export function getAuth() {
  if (shared) return shared;
  const query = (text, params) => {
    if (!process.env.SUPABASE_DB_URL) throw authError('auth/internal-error', 'SUPABASE_DB_URL is required for sign-in.');
    pool ||= new pg.Pool({ connectionString: process.env.SUPABASE_DB_URL, max: 3,
      ssl: /localhost|127\.0\.0\.1|host=\//u.test(process.env.SUPABASE_DB_URL) ? false : { rejectUnauthorized: false } });
    return pool.query(text, params);
  };
  shared = createSupabaseAuth({
    url: process.env.SUPABASE_URL, publishableKey: process.env.SUPABASE_PUBLISHABLE_KEY, secretKey: process.env.SUPABASE_SECRET_KEY,
    query,
    findProfileByEmail: async email => {
      const normalized = String(email || '').trim().toLowerCase();
      // Older profiles may store the address with capitals, so compare without case.
      const { rows } = await query(`select id, data->>'email' as email from public.users
          where lower(trim(data->>'email')) = $1 limit 2`, [normalized]);
      // Two profiles on one address cannot be told apart safely: neither is moved.
      if (rows.length !== 1) return null;
      return { uid: rows[0].id, email: normalized };
    },
  });
  return shared;
}
