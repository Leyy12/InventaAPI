import { createHash } from 'node:crypto';

// Some customer websites send the same catalog request twice in a row (for example a
// React page in development mode runs its loading code twice). Without this, each copy
// counted against the account's request allowance and showed twice in API history.
//
// Within `windowMs`, a repeat of the same GET (same API key, same URL) gets the first
// request's successful answer without being authenticated, counted or logged again.
// A repeat that arrives while the first is still running waits for it. Only 200
// responses are reused; anything else is handled as a normal new request.
// The cache is per server instance and short-lived, so it is best effort.
export function createRepeatGuard({ windowMs = 2000, maxEntries = 1000, waitMs = 10000, now = () => Date.now() } = {}) {
  const entries = new Map(); // id -> { at, done: Promise<{ status, body } | null> }

  const prune = time => {
    for (const [id, entry] of entries) if (time - entry.at >= windowMs) entries.delete(id);
    while (entries.size > maxEntries) entries.delete(entries.keys().next().value);
  };

  return async (req, res, next) => {
    const credential = req.headers['x-api-key'] || req.query?.apiKey;
    if (req.method !== 'GET' || typeof credential !== 'string' || !credential) return next();
    const id = createHash('sha256').update(credential).update('\n').update(req.originalUrl || req.url || '').digest('hex');
    const time = now();
    prune(time);

    const earlier = entries.get(id);
    if (earlier && time - earlier.at < windowMs) {
      const result = await Promise.race([earlier.done, new Promise(resolve => setTimeout(() => resolve(null), waitMs))]);
      if (result && result.status === 200) {
        res.set('Cache-Control', 'no-store');
        res.set('X-Inventa-Repeat', 'reused');
        return res.status(200).json(result.body);
      }
      return next();
    }

    let settle;
    const entry = { at: time, done: new Promise(resolve => { settle = resolve; }) };
    entries.set(id, entry);
    const json = res.json.bind(res);
    res.json = body => {
      settle({ status: res.statusCode, body });
      if (res.statusCode !== 200 && entries.get(id) === entry) entries.delete(id);
      return json(body);
    };
    res.on('close', () => settle(null));
    return next();
  };
}
