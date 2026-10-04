import Link from 'next/link';
import CodeSnippet from '@/components/shared/CodeSnippet';

export default function DocsPage() {
  return <div className="w-full px-6 lg:px-8 pb-10 space-y-6 text-slate-300">
    <h1 className="text-3xl font-bold text-white">API Documentation</h1>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Quick start and authentication</h2>
      <p>API keys can be generated once per account per UTC day. Only a successfully created key uses this allowance. Revoking it or losing its one-time secret does not restore the allowance. Free Trial additionally permits only one active API key with 50–500 currently linked products. Use secure one-for-one replacement if its secret is lost.</p>
      <p>Select authorized products and create a key on the <Link href="/dashboard/products" className="text-indigo-300">Products page</Link>. Save the secret when it is shown once. Manage or revoke keys on the <Link href="/dashboard/api-keys" className="text-indigo-300">API Keys page</Link>.</p>
      <p>Send your saved API key in the <code>x-api-key: YOUR_API_KEY</code> header. This is different from the Firebase Bearer authentication used by the Customer management application.</p>
      <p>Keep keys in server-side secret configuration, never in URLs, public repositories, browser code or analytics. Example hostnames must be replaced with your operator-confirmed API origin.</p>
    </section>
    <CodeSnippet />
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">GET /daas/v1/catalog</h2>
      <p>Returns current, eligible canonical products authorized by this key and account. Product updates are reflected on subsequent requests through the same valid key; no key regeneration is required. This is not a push or real-time delivery guarantee.</p>
      <p>Optional parameters: <code>q</code> (or <code>search</code>) searches product text; <code>page</code> is a positive page number; <code>perPage</code> is the requested page size. Follow returned <code>meta.pagination</code> when present; empty results may omit pagination. Pagination is separate from the Trial catalog size of 50–500 selected products.</p>
      <p>The successful catalog envelope uses <code>status: &quot;success&quot;</code>, <code>meta</code> and <code>products</code>, not <code>success/data</code>. Product IDs are strings. Read product fields and variants from the response; do not assume every product has a variant or SKU.</p>
      <pre className="bg-slate-950 p-4 overflow-x-auto text-xs">{JSON.stringify({ status: 'success', message: 'No authorized products available', meta: { count: 0, keyName: 'Example key', plan: 'Free' }, products: [] }, null, 2)}</pre>
      <p className="text-xs text-slate-400">Illustrative empty-result envelope. Exact messages and optional metadata vary. There is no DaaS /products/:id route; search uses the catalog query above.</p>
      <p><code>GET /daas/v1/health</code> is a health check, not a product request. Recommendations and sales endpoints below use the same account-level quota and security/IP limits as catalog requests.</p>
    </section>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Completed sales integration</h2>
      <p><code>POST /daas/v1/sales</code> accepts one completed PHP sale from the authenticated key&apos;s own linked, currently eligible catalog products. Send <code>x-api-key</code> in the header. Paid account quotas apply; Trial calls do not consume a product allowance. An Upgrade Required account cannot ingest.</p>
      <pre className="bg-slate-950 p-4 overflow-x-auto text-xs">{JSON.stringify({ externalTransactionId: 'YOUR_STABLE_POS_REFERENCE', occurredAt: '2026-09-27T10:00:00.000Z', currency: 'PHP', items: [{ productId: 'AUTHORIZED_PRODUCT_ID', quantity: 2, unitPrice: 12.50 }] }, null, 2)}</pre>
      <p>Quantity is a positive whole number, unitPrice is PHP with at most two decimal places, and occurredAt must include a timezone. The server derives line and transaction totals in centavos. Do not send customer names, emails, addresses, phone numbers, card details, credentials, or a client total; extra fields are rejected.</p>
      <p><code>externalTransactionId</code> is unique per account. Retrying the same canonical sale returns <code>created: false</code> without double-counting. Reusing the reference for different content returns <code>409 SALE_CONFLICT</code>. A different key on the account cannot replay another integration&apos;s sale.</p>
    </section>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Real sales reporting and recommendations</h2>
      <p><code>GET /daas/v1/sales-feed</code> is for active Pro/Pro Max (and compatible legacy paid) plans, not Free or Trial. It returns your own completed sales: PHP summary, UTC daily time series, and top products. With no sales it returns zeros, empty arrays, and <code>hasData: false</code>—never sample figures.</p>
      <p>Optional <code>from</code> and <code>to</code> are inclusive UTC dates in <code>YYYY-MM-DD</code> format. Default is the last 30 days; maximum is 90 days. Invalid/future/unbounded ranges return <code>400 INVALID_RANGE</code>. Very large result sets fail closed with <code>503 SALES_REPORT_TOO_LARGE</code>; select a shorter range.</p>
      <p><code>GET /daas/v1/recommendations</code> is available during an active Free Trial, Pro, and Pro Max under their existing key, segment, and quota rules. It returns authorized current products with rank, factual reason, and <code>basis: sales</code> or <code>basis: catalog</code>. Without useful sales evidence it falls back to catalog availability. It does not infer market demand or use AI.</p>
      <p>The Customer dashboard reads the same reports via Firebase-authenticated <code>/api/v1/customer/insights/sales-feed</code> and <code>/api/v1/customer/insights/recommendations</code>, without exposing an API key to the browser. These dashboard reads do not consume a DaaS key allowance; they remain account-owned and server-authorized.</p>
    </section>
    <section className="glass-card rounded-xl border border-slate-700 p-6 space-y-3">
      <h2 className="text-xl font-semibold text-white">Account usage and recorded history</h2>
      <p>Check API Keys for backend-verified catalog limits and expiry. The one-time Free Trial starts automatically on verified Customer login, lasts exactly 7 days and permits one active API key with 50–500 currently selected products in one Business Segment. API calls do not consume products or shorten the Trial. Pro allows 5,000/day; Pro Max has unlimited account quota while standard security and IP/rate limits still apply. After Trial expires, protected API access and Trial catalog edits pause until a paid plan is active. There is no ordinary Free monthly allowance. Existing keys and historical counters remain stored. Paid quota is shared across keys; creating another key does not reset it.</p>
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
