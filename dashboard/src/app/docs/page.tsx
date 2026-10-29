import Link from 'next/link';
import CodeSnippet from '@/components/shared/CodeSnippet';

export default function DocsPage() {
  return <div className="w-full px-6 max-sm:px-0 lg:px-8 pb-10 space-y-6 text-slate-300">
    <h1 className="text-3xl font-bold text-white">API Documentation</h1>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Quick start and authentication</h2>
      <p>Free Trial: API keys can be generated once per account per UTC day, with up to 5 active keys sharing up to 50 linked products. Pro: one API key for your business segment; use <strong>Add to my API key</strong> on the Products page to add more products to it. Pro Max: up to 3 API keys, one per segment (Grocery, Pharmacy, Hardware); <strong>Add selected products</strong> puts each product into its segment&apos;s key and creates that key the first time. Use secure one-for-one replacement if a secret is lost.</p>
      <p>Select authorized products and create a key on the <Link href="/dashboard/products" className="text-indigo-300">Products page</Link>. Copy the secret when it is shown; you can copy it again later from API Keys. Manage or revoke keys on the <Link href="/dashboard/api-keys" className="text-indigo-300">API Keys page</Link>.</p>
      <p>Send your saved API key in the <code>x-api-key: YOUR_API_KEY</code> header. This is different from the signed-in session (Bearer token) the Customer dashboard uses.</p>
      <p>Keep keys in server-side secret configuration, never in URLs, public repositories, browser code or analytics. Example hostnames must be replaced with your operator-confirmed API origin.</p>
    </section>
    <CodeSnippet />
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">GET /daas/v1/catalog</h2>
      <p>Returns current, eligible canonical products authorized by this key and account. Product updates are reflected on subsequent requests through the same valid key; no key regeneration is required. This is not a push or real-time delivery guarantee.</p>
      <p>Optional parameters: <code>q</code> (or <code>search</code>) searches product text; <code>page</code> is a positive page number; <code>perPage</code> is the requested page size. Follow returned <code>meta.pagination</code> when present; empty results may omit pagination. Pagination is separate from the Trial catalog size of up to 50 selected products.</p>
      <p>The successful catalog envelope uses <code>status: &quot;success&quot;</code>, <code>meta</code> and <code>products</code>, not <code>success/data</code>. Product IDs are strings. Read product fields and variants from the response; do not assume every product has a variant or SKU.</p>
      <pre className="code-panel rounded-lg p-4 overflow-x-auto text-xs">{JSON.stringify({ status: 'success', message: 'No authorized products available', meta: { count: 0, keyName: 'Example key', plan: 'Free' }, products: [] }, null, 2)}</pre>
      <p className="text-xs text-slate-400">Illustrative empty-result envelope. Exact messages and optional metadata vary. There is no DaaS /products/:id route; search uses the catalog query above.</p>
      <p><code>GET /daas/v1/health</code> is a health check, not a product request.</p>
    </section>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Account usage and recorded history</h2>
      <p>Check API Keys for backend-verified catalog limits and expiry. The one-time Free Trial starts automatically on verified Customer login, lasts exactly 7 days and permits up to 5 active API keys sharing up to 50 currently selected products in one Business Segment. API calls do not consume products or shorten the Trial. Pro allows 15,000 API requests per month for the account; Pro Max allows 15,000 per month for each segment key. Monthly allowances reset on the 1st (UTC), and standard security and IP/rate limits still apply. After Trial expires, protected API access and Trial catalog edits pause until a paid plan is active. There is no ordinary Free monthly allowance. Existing keys and historical counters remain stored. Replacing or revoking a key never resets the monthly count.</p>
      <p>Key Name is your user-selected key alias, recorded at request time. Older or malformed records may have unavailable fields.</p>
    </section>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Errors</h2>
      <p>Key generation: 409 with <code>API_KEY_DAILY_GENERATION_LIMIT</code> means this account already generated a key in the current UTC day. The server returns <code>nextEligibleAt</code>, the next 00:00 UTC. This is separate from API request quota exhaustion and IP rate limiting.</p>
      <p>Always check HTTP status before using data. 400: malformed sale or date range; 401: invalid or missing credential; 403 with <code>UPGRADE_REQUIRED</code>: no active Trial or paid entitlement, and Pro or Pro Max is required for protected API access; other 403: account, plan or product scope denied; 409: conflicting sale reference; 429: temporary paid account quota exhaustion or the separate short-window IP rate limit; 503 with QUOTA_CUTOVER_PENDING: paid account activation hold; other 500/503: server or verification unavailable. A network error is not an empty catalog or zero sales.</p>
      <p>Security errors use flat <code>error</code> (code) and <code>message</code> fields; some include quota metadata. Respect the returned reset/hold time for quota responses or Retry-After for the IP limiter. Do not retry by generating keys or assume every error has a nested <code>error.message</code>.</p>
      <p>Need help? <a href="mailto:support@inventaapi.com" className="text-indigo-300">Contact support</a>.</p>
    </section>
  </div>;
}
