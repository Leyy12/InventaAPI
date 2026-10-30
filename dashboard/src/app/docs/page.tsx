import Link from 'next/link';
import CodeSnippet from '@/components/shared/CodeSnippet';

const card = 'glass-card rounded-xl border border-slate-700 p-6 space-y-3';
const h2 = 'text-xl font-semibold text-white';
const code = 'code-panel rounded-lg p-4 overflow-x-auto text-xs';

const proMaxExample = {
  status: 'success',
  meta: {
    count: 1, total: 1, keyName: 'Pro Max API key', plan: 'Pro Max', requestsUsed: 81,
    quota: {
      period: 'monthly', unit: 'requests', scope: 'account', used: 81, limit: null, remaining: null, unlimited: true,
      resetsAt: '2026-11-01T00:00:00.000Z',
    },
    pagination: { page: 1, perPage: 1, total: 1, totalPages: 1, hasNextPage: false, nextPage: null },
  },
  products: [{ id: 'abc123', name: '555 Sardines', segment: 'Grocery', category: 'Canned Goods', variants: ['…8 variants…'] }],
};

export default function DocsPage() {
  return <div className="w-full px-6 max-sm:px-0 lg:px-8 pb-10 space-y-6 text-slate-300">
    <h1 className="text-3xl font-bold text-white">API Documentation</h1>

    <section className={card}>
      <h2 className={h2}>Quick start</h2>
      <ol className="list-decimal pl-5 space-y-1">
        <li>Choose products on the <Link href="/dashboard/products" className="text-indigo-300">Products page</Link> and add them to your API key (the key is created the first time).</li>
        <li>Copy the key when it is shown. You can copy it again later from <Link href="/dashboard/api-keys" className="text-indigo-300">API Keys</Link>, where you can also revoke it.</li>
        <li>Store the key in your server&apos;s secret configuration (for example an <code>.env</code> file as <code>INVENTA_API_KEY</code>).</li>
        <li>Call <code>GET /daas/v1/catalog</code> with the header <code>x-api-key: YOUR_API_KEY</code>.</li>
      </ol>
      <p>Never put a key in URLs, public repositories, browser code or analytics. The <code>x-api-key</code> header is different from the signed-in session (Bearer token) the Customer dashboard uses. Example hostnames must be replaced with your operator-confirmed API origin.</p>
    </section>

    <section className={card}>
      <h2 className={h2}>Plans, API keys and monthly allowance</h2>
      <div className="overflow-x-auto">
        <table className="w-full text-sm text-left">
          <thead className="text-slate-400"><tr>
            <th className="py-2 pr-4">Plan</th><th className="py-2 pr-4">API keys</th><th className="py-2 pr-4">Products per key</th><th className="py-2">Monthly allowance</th>
          </tr></thead>
          <tbody className="align-top">
            <tr className="border-t border-slate-700">
              <td className="py-2 pr-4 font-semibold text-white">Free Trial (7 days)</td>
              <td className="py-2 pr-4">One key for your business segment</td>
              <td className="py-2 pr-4">Up to 50</td>
              <td className="py-2">No monthly allowance; calls do not use up products</td>
            </tr>
            <tr className="border-t border-slate-700">
              <td className="py-2 pr-4 font-semibold text-white">Pro</td>
              <td className="py-2 pr-4">One key for your business segment</td>
              <td className="py-2 pr-4">Up to 7,500</td>
              <td className="py-2">Unlimited API requests</td>
            </tr>
            <tr className="border-t border-slate-700">
              <td className="py-2 pr-4 font-semibold text-white">Pro Max</td>
              <td className="py-2 pr-4">One key for all three segments (Grocery, Pharmacy, Hardware)</td>
              <td className="py-2 pr-4">Up to 15,000</td>
              <td className="py-2">Unlimited API requests</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Every plan has one API key, and you can use it in as many projects as you like. Pro and Pro Max add products with <strong>Add to my API key</strong> on the Products page; a second key is refused. Use secure one-for-one replacement if a secret is lost. Monthly allowances reset on the 1st of each month (UTC). Replacing or revoking a key never resets the count.</p>
    </section>

    <CodeSnippet />

    <section className={card}>
      <h2 className={h2}>GET /daas/v1/catalog</h2>
      <p>Returns the current, eligible products authorized by your key. Product updates show up on the next request through the same valid key; no key regeneration is required. This is not a push or real-time delivery guarantee.</p>
      <p className="font-semibold text-white">Optional query parameters</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><code>segment</code>: <code>Grocery</code>, <code>Pharmacy</code> or <code>Hardware</code> returns only that segment&apos;s products. Useful with a Pro Max key, which holds all three: each of your stores can ask for just its own products.</li>
        <li><code>q</code> (or <code>search</code>): search product text.</li>
        <li><code>page</code> and <code>perPage</code>: page through large catalogs. Follow <code>meta.pagination</code>.</li>
      </ul>
      <pre className={code}>{`GET /daas/v1/catalog?segment=Grocery
x-api-key: YOUR_API_KEY`}</pre>
      <p>The response has <code>status: &quot;success&quot;</code>, <code>meta</code> and <code>products</code> (not <code>success/data</code>). Product IDs are strings. Read fields and variants from each product; do not assume every product has a variant or SKU.</p>
      <p className="font-semibold text-white">Usage fields in <code>meta</code> (Pro and Pro Max)</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><code>quota</code>: requests recorded for your account this month (<code>used</code>, including this call). Paid plans have no monthly limit, so <code>limit</code> and <code>remaining</code> are <code>null</code> and <code>unlimited</code> is <code>true</code>.</li>
      </ul>
      <pre className={code}>{JSON.stringify(proMaxExample, null, 2)}</pre>
      <p className="text-xs text-slate-400">Illustrative Pro Max response. Exact messages and optional metadata vary. There is no DaaS /products/:id route; use search above. <code>GET /daas/v1/health</code> is a health check, not a product request.</p>
    </section>

    <section className={card}>
      <h2 className={h2}>Requests and rate limits</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Pro and Pro Max have <strong>unlimited API requests</strong>; there is no monthly cap. Each call is still recorded for your request history.</li>
        <li>To protect the service, each IP address can make up to 60 catalog requests per minute. Above that, calls get <code>429</code> with a <code>Retry-After</code> header; wait and retry.</li>
        <li>The same request repeated within 2 seconds reuses the first answer. <code>/daas/v1/health</code> is never recorded.</li>
        <li>The Free Trial has no monthly request allowance: calls do not use up products or shorten the Trial. After the Trial ends, protected API access pauses until a paid plan is active.</li>
      </ul>
      <p>The products on your key are shown on the dashboard Overview. Key Name in request history is the key alias recorded at request time; older records may have unavailable fields.</p>
    </section>

    <section className={card}>
      <h2 className={h2}>Errors</h2>
      <p>Always check the HTTP status before using data. A network error is not an empty catalog.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><code>401</code>: invalid, revoked or missing key.</li>
        <li><code>403 UPGRADE_REQUIRED</code>: no active Trial or paid plan. Other <code>403</code>: account, plan or product scope denied.</li>
        <li><code>429</code>: too many requests from one IP address in a short time (60 per minute). Respect the <code>Retry-After</code> header.</li>
        <li>503 with QUOTA_CUTOVER_PENDING: paid account activation hold. Other <code>500</code>/<code>503</code>: server or verification unavailable.</li>
        <li><code>400</code>: malformed sale or date range. <code>409</code>: conflicting sale reference.</li>
      </ul>
      <p className="font-semibold text-white">When creating keys or adding products</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><code>409 API_KEY_DAILY_GENERATION_LIMIT</code>: a key was already generated today; <code>nextEligibleAt</code> gives the next 00:00 UTC.</li>
        <li><code>409 PRO_SINGLE_KEY</code> / <code>PRO_MAX_SINGLE_KEY</code> / <code>TRIAL_KEY_LIMIT</code>: your plan includes one key. Add products to it instead.</li>
        <li><code>400 KEY_PRODUCT_LIMIT</code>: the key is full (Pro 7,500, Pro Max 15,000 products).</li>
      </ul>
      <p>Errors use flat <code>error</code> (code) and <code>message</code> fields; some include quota metadata. Do not retry by generating keys.</p>
      <p>Need help? <a href="mailto:support@inventaapi.com" className="text-indigo-300">Contact support</a>.</p>
    </section>
  </div>;
}
