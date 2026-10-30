import Link from 'next/link';
import CodeSnippet from '@/components/shared/CodeSnippet';

const card = 'glass-card rounded-xl border border-slate-700 p-6 space-y-3';
const h2 = 'text-xl font-semibold text-white';
const code = 'code-panel rounded-lg p-4 overflow-x-auto text-xs';

const proMaxExample = {
  status: 'success',
  meta: {
    count: 1, total: 1, keyName: 'Pro Max API key', plan: 'Pro Max', variantsSent: 8,
    quota: {
      period: 'monthly', unit: 'products', scope: 'segment', limit: 15000, resetsAt: '2026-11-01T00:00:00.000Z',
      buckets: [
        { bucket: 'Grocery', used: 8, remaining: 14992 },
        { bucket: 'Pharmacy', used: 0, remaining: 15000 },
        { bucket: 'Hardware', used: 0, remaining: 15000 },
      ],
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
              <td className="py-2 pr-4">Up to 5 active keys; one new key per UTC day</td>
              <td className="py-2 pr-4">Up to 50 products shared by all keys, one segment</td>
              <td className="py-2">No monthly allowance; calls do not use up products</td>
            </tr>
            <tr className="border-t border-slate-700">
              <td className="py-2 pr-4 font-semibold text-white">Pro</td>
              <td className="py-2 pr-4">One key for your business segment</td>
              <td className="py-2 pr-4">Up to 500</td>
              <td className="py-2">15,000 products per month for the account</td>
            </tr>
            <tr className="border-t border-slate-700">
              <td className="py-2 pr-4 font-semibold text-white">Pro Max</td>
              <td className="py-2 pr-4">One key for all three segments (Grocery, Pharmacy, Hardware)</td>
              <td className="py-2 pr-4">Up to 1,500</td>
              <td className="py-2">15,000 products per month for <em>each</em> segment</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p>Pro and Pro Max add products with <strong>Add to my API key</strong> on the Products page; a second key is refused. Use secure one-for-one replacement if a secret is lost. Monthly allowances reset on the 1st of each month (UTC). Replacing or revoking a key never resets the count.</p>
    </section>

    <CodeSnippet />

    <section className={card}>
      <h2 className={h2}>GET /daas/v1/catalog</h2>
      <p>Returns the current, eligible products authorized by your key. Product updates show up on the next request through the same valid key; no key regeneration is required. This is not a push or real-time delivery guarantee.</p>
      <p className="font-semibold text-white">Optional query parameters</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><code>segment</code>: <code>Grocery</code>, <code>Pharmacy</code> or <code>Hardware</code> returns only that segment&apos;s products. Useful with a Pro Max key, which holds all three: each of your stores can ask for its own segment and use only that segment&apos;s allowance.</li>
        <li><code>q</code> (or <code>search</code>): search product text.</li>
        <li><code>page</code> and <code>perPage</code>: page through large catalogs. Follow <code>meta.pagination</code>.</li>
      </ul>
      <pre className={code}>{`GET /daas/v1/catalog?segment=Grocery
x-api-key: YOUR_API_KEY`}</pre>
      <p>The response has <code>status: &quot;success&quot;</code>, <code>meta</code> and <code>products</code> (not <code>success/data</code>). Product IDs are strings. Read fields and variants from each product; do not assume every product has a variant or SKU.</p>
      <p className="font-semibold text-white">Usage fields in <code>meta</code> (Pro and Pro Max)</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><code>quota</code>: this month&apos;s usage. Pro: <code>used</code>, <code>limit</code>, <code>remaining</code>. Pro Max: one entry per segment in <code>quota.buckets</code>.</li>
        <li><code>variantsSent</code>: how many variants this response used.</li>
        <li><code>quotaLimited</code> and <code>quotaMessage</code>: present when the allowance ran out and the response was cut short.</li>
      </ul>
      <pre className={code}>{JSON.stringify(proMaxExample, null, 2)}</pre>
      <p className="text-xs text-slate-400">Illustrative Pro Max response. Exact messages and optional metadata vary. There is no DaaS /products/:id route; use search above. <code>GET /daas/v1/health</code> is a health check, not a product request.</p>
    </section>

    <section className={card}>
      <h2 className={h2}>How the monthly allowance is counted</h2>
      <ul className="list-disc pl-5 space-y-1">
        <li>Every product <strong>variant</strong> a catalog response sends counts as one. A product without variants counts as one. Example: one product with 8 variants uses 8.</li>
        <li>Pro Max counts each variant against its <strong>own product&apos;s segment</strong>, so Grocery, Pharmacy and Hardware each have their own 15,000. If one segment runs out, products from the other segments still arrive.</li>
        <li>When fewer are left than a page needs, only what fits is sent and <code>quotaLimited</code> is set. Once nothing is left, requests get <code>429</code> until the 1st of next month (UTC).</li>
        <li>Searches with no results and keys with no products use nothing. The same request repeated within 2 seconds reuses the first answer and is not counted again.</li>
        <li>The Free Trial has no monthly allowance: calls do not use up products or shorten the Trial. After the Trial ends, protected API access pauses until a paid plan is active.</li>
      </ul>
      <p>Your current usage is on the dashboard Overview and the API Keys page. Key Name in request history is the key alias recorded at request time; older records may have unavailable fields.</p>
    </section>

    <section className={card}>
      <h2 className={h2}>Errors</h2>
      <p>Always check the HTTP status before using data. A network error is not an empty catalog.</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><code>401</code>: invalid, revoked or missing key.</li>
        <li><code>403 UPGRADE_REQUIRED</code>: no active Trial or paid plan. Other <code>403</code>: account, plan or product scope denied.</li>
        <li><code>429</code>: the monthly allowance is used up (for Pro Max, for the segment(s) requested), or the separate short-window IP rate limit. Respect the reset time in <code>quota</code> or the <code>Retry-After</code> header.</li>
        <li>503 with QUOTA_CUTOVER_PENDING: paid account activation hold. Other <code>500</code>/<code>503</code>: server or verification unavailable.</li>
        <li><code>400</code>: malformed sale or date range. <code>409</code>: conflicting sale reference.</li>
      </ul>
      <p className="font-semibold text-white">When creating keys or adding products</p>
      <ul className="list-disc pl-5 space-y-1">
        <li><code>409 API_KEY_DAILY_GENERATION_LIMIT</code>: a key was already generated today; <code>nextEligibleAt</code> gives the next 00:00 UTC.</li>
        <li><code>409 PRO_SINGLE_KEY</code> / <code>PRO_MAX_SINGLE_KEY</code>: your plan includes one key. Add products to it instead.</li>
        <li><code>400 KEY_PRODUCT_LIMIT</code>: the key is full (Pro 500, Pro Max 1,500 products).</li>
      </ul>
      <p>Errors use flat <code>error</code> (code) and <code>message</code> fields; some include quota metadata. Do not retry by generating keys.</p>
      <p>Need help? <a href="mailto:support@inventaapi.com" className="text-indigo-300">Contact support</a>.</p>
    </section>
  </div>;
}
