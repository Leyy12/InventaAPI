import Link from 'next/link';
import CodeSnippet from '@/components/shared/CodeSnippet';

export default function DocsPage() {
  return <div className="w-full px-6 lg:px-8 pb-10 space-y-6 text-slate-300">
    <h1 className="text-3xl font-bold text-white">API Documentation</h1>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Quick start and authentication</h2>
      <p>API keys can be generated once per account per UTC day. Only a successfully created key uses this allowance. Revoking it or losing its one-time secret does not restore the allowance. Existing keys remain valid; this is not a one-key maximum or a one-request-per-day limit.</p>
      <p>Select authorized products and create a key on the <Link href="/dashboard/products" className="text-indigo-300">Products page</Link>. Save the secret when it is shown once. Manage or revoke keys on the <Link href="/dashboard/api-keys" className="text-indigo-300">API Keys page</Link>.</p>
      <p>Send your saved API key in the <code>x-api-key: YOUR_API_KEY</code> header. This is different from the Firebase Bearer authentication used by the Customer management application.</p>
      <p>Keep keys in server-side secret configuration, never in URLs, public repositories, browser code or analytics. Example hostnames must be replaced with your operator-confirmed API origin.</p>
    </section>
    <CodeSnippet />
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">GET /daas/v1/catalog</h2>
      <p>Returns current, eligible canonical products authorized by this key and account. Product updates are reflected on subsequent requests through the same valid key; no key regeneration is required. This is not a push or real-time delivery guarantee.</p>
      <p>Optional parameters: <code>q</code> (or <code>search</code>) searches product text; <code>page</code> is a positive page number; <code>perPage</code> is the requested page size. Free catalog pages are capped at 50 products. Page size is not the daily request allowance. Follow returned <code>meta.pagination</code> when present; empty results may omit pagination.</p>
      <p>The successful catalog envelope uses <code>status: &quot;success&quot;</code>, <code>meta</code> and <code>products</code>, not <code>success/data</code>. Product IDs are strings. Read product fields and variants from the response; do not assume every product has a variant or SKU.</p>
      <pre className="bg-slate-950 p-4 overflow-x-auto text-xs">{JSON.stringify({ status: 'success', message: 'No authorized products available', meta: { count: 0, keyName: 'Example key', plan: 'Free' }, products: [] }, null, 2)}</pre>
      <p className="text-xs text-slate-400">Illustrative empty-result envelope. Exact messages and optional metadata vary. There is no DaaS /products/:id route; search uses the catalog query above.</p>
      <p><code>GET /daas/v1/health</code> is a health check, not a product request. The existing Pro/Enterprise <code>/daas/v1/sales-feed</code> currently returns demonstration sales data; it is not an authoritative sales report.</p>
    </section>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Account usage and recorded history</h2>
      <p>Check API Keys for your backend-verified daily limit, usage, remaining allowance and UTC reset. The daily quota is account-level, shared across keys. Creating another key does not reset it. History is a bounded record of logged route requests, not the quota counter.</p>
      <p>Key Name is your user-selected key alias, recorded at request time. Older or malformed records may have unavailable fields.</p>
    </section>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Errors</h2>
      <p>Key generation: 409 with <code>API_KEY_DAILY_GENERATION_LIMIT</code> means this account already generated a key in the current UTC day. The server returns <code>nextEligibleAt</code>, the next 00:00 UTC. This is separate from API request quota exhaustion and IP rate limiting.</p>
      <p>Always check HTTP status before using products. 401: invalid or missing credential; 403: denied/inactive key, account or scope; 429: daily account quota exhausted or the separate short-window IP rate limit reached; 503 with QUOTA_CUTOVER_PENDING: account activation hold; other 500/503: server or verification unavailable. A network error is not an empty catalog.</p>
      <p>Security errors use flat <code>error</code> (code) and <code>message</code> fields; some include quota metadata. Respect the returned reset/hold time for quota responses or Retry-After for the IP limiter. Do not retry by generating keys or assume every error has a nested <code>error.message</code>.</p>
      <p>Need help? <a href="mailto:support@inventaapi.com" className="text-indigo-300">Contact support</a>.</p>
    </section>
  </div>;
}
