import { COLLECTIONS, fail, validateTarget } from './frozen-catalog-export.mjs';

// Firestore REST capability allowlist: one exact document GET, two collection
// list GETs and count-only aggregation POSTs. No generic caller-supplied URL/body.
export function createReadOnlyAdapter(options, { accessToken, transport }) {
  validateTarget(options);
  const target = `projects/${options.project}/databases/${options.database}/documents`;
  const base = `https://firestore.googleapis.com/v1/${target}`;
  function collectionName(name) { if (!COLLECTIONS.includes(name)) fail('COLLECTION NOT ALLOWED'); }
  async function read(url, method = 'GET', body) {
    try {
      const token = await accessToken();
      if (typeof token !== 'string' || !token) fail('AUTHENTICATION FAILED');
      const response = await transport(url, { method, redirect: 'error', signal: AbortSignal.timeout(30000),
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      if (response.status !== 200) fail('FIRESTORE READ FAILED');
      // Bound each response without logging bodies, request headers or SDK errors.
      let text = '', bytes = 0;
      const decoder = new TextDecoder('utf-8', { fatal: true });
      for await (const chunk of response.body) {
        bytes += chunk.byteLength;
        if (bytes > 32 * 1024 * 1024) fail('FIRESTORE RESPONSE TOO LARGE');
        text += decoder.decode(chunk, { stream: true });
      }
      text += decoder.decode();
      return JSON.parse(text);
    } catch { fail('FIRESTORE READ FAILED'); }
  }
  return Object.freeze({ target,
    control: () => read(`${base}/catalog_control/writer`),
    page(name, token) {
      collectionName(name);
      if (token !== undefined) {
        if (typeof token !== 'string' || !token) fail('INVALID PAGE TOKEN');
      }
      const query = new URLSearchParams({ pageSize: '500', orderBy: '__name__ ASC', ...(token === undefined ? {} : { pageToken: token }) });
      return read(`${base}/${name}?${query}`);
    },
    async count(name) {
      collectionName(name);
      const result = await read(`${base}:runAggregationQuery`, 'POST', { structuredAggregationQuery: {
        structuredQuery: { from: [{ collectionId: name }] }, aggregations: [{ alias: 'total', count: {} }] } });
      if (!Array.isArray(result)) fail('INVALID COUNT RESPONSE');
      const rows = result.filter(row => row.result !== undefined);
      const count = rows[0]?.result?.aggregateFields?.total?.integerValue;
      if (rows.length !== 1 || typeof count !== 'string' || !/^(?:0|[1-9]\d*)$/u.test(count)
        || !Number.isSafeInteger(Number(count))) fail('INVALID COUNT RESPONSE');
      return Number(count);
    },
  });
}
