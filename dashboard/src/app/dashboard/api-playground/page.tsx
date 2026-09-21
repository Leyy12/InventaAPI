"use client";

import { useState } from "react";
import { 
  Play, Copy, Check, Key, Database, AlertCircle, 
  Download, RefreshCw, Sparkles, Zap, ChevronDown, ChevronRight
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import CodeSnippet from "@/components/shared/CodeSnippet";

interface ApiResponse {
  success: boolean;
  products?: { id?: string; name?: string; sku?: string; segment?: string; [key: string]: unknown }[];
  error?: string;
  message?: string;
  [key: string]: unknown;
}
export default function ApiPlaygroundPage() {
  const searchParams = useSearchParams();
  const preselectedProducts = searchParams.get('products');

  // State Management
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("/daas/v1/catalog");
  const method = "GET";
  const [queryParams, setQueryParams] = useState({
    q: "",
    perPage: "50",
    page: "1"
  });
  
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);


  // Build full API URL with query params
  const buildApiUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
    const url = new URL(`${baseUrl}${endpoint}`);
    
    Object.entries(queryParams).forEach(([key, value]) => {
      if (endpoint === "/daas/v1/catalog" && value) {
        url.searchParams.append(key, value);
      }
    });
    
    return url.toString();
  };

  // Execute API Request
  const executeRequest = async () => {
    if (!apiKey.trim()) {
      alert("Please enter an API key");
      return;
    }

    setLoading(true);
    setResponseTime(null);
    const startTime = performance.now();

    try {
      const apiUrl = buildApiUrl();
      
      const res = await fetch(apiUrl, {
        method,
        headers: {
          'x-api-key': apiKey,
          'Content-Type': 'application/json',
        }
      });

      const endTime = performance.now();
      setResponseTime(Math.round(endTime - startTime));

      const data = await res.json();
      
      // Display actual HTTP outcome without assuming an old success/data envelope.
      if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid response');
      setResponse({ ...data, success: res.ok, httpStatus: res.status });

    } catch {
      setResponse({
        success: false,
        error: "Network Error",
        message: "Failed to retrieve a valid response from the API server"
      });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = async (text: string) => {
    try { await navigator.clipboard.writeText(text); alert('Response copied.'); }
    catch { alert('Copy failed. Select and copy the response manually.'); }
  };

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">API Playground</h1>
          <p className="text-slate-400">Test authorized API requests. Catalog requests consume your shared account allowance.</p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setResponse(null)}
            className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors flex items-center gap-2"
          >
            <RefreshCw className="w-4 h-4" />
            Clear
          </button>
        </div>
      </div>

      {/* Info Banner */}
      {preselectedProducts && (
        <div className="glass-card rounded-xl p-4 border-l-4 border-indigo-500 flex items-start gap-3">
          <Sparkles className="w-5 h-5 text-indigo-400 flex-shrink-0 mt-0.5" />
          <div>
            <h3 className="text-sm font-bold text-white mb-1">Products Pre-selected</h3>
            <p className="text-xs text-slate-400">
              You selected {preselectedProducts.split(',').length} products. Use a key with the appropriate product scope. This navigation hint does not authorize access.
            </p>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* LEFT PANEL: Request Configuration */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Zap className="w-5 h-5 text-indigo-400" />
              Request Configuration
            </h2>

            {/* API Key Input */}
            <div className="mb-4">
              <label className="text-sm font-medium text-slate-300 mb-2 block">API KEY</label>
              <div className="relative">
                <Key className="w-5 h-5 text-slate-500 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="password"
                  autoComplete="off"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="YOUR_API_KEY"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Paste your saved API key. Full keys are shown only when created.</p>
            </div>

            {/* Endpoint Selection */}
            <div className="mb-4">
              <label className="text-sm font-medium text-slate-300 mb-2 block">ENDPOINT</label>
              <select
                value={endpoint}
                onChange={(e) => setEndpoint(e.target.value)}
                className="w-full bg-slate-900/50 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
              >
                <option value="/daas/v1/catalog">GET /daas/v1/catalog (Product Catalog)</option>
                <option value="/daas/v1/health">GET /daas/v1/health (Health Check)</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Use <code className="text-indigo-400">/daas/v1/catalog</code> — the primary endpoint that returns only products linked to your API key.
              </p>
            </div>

            {endpoint === "/daas/v1/catalog" && <div className="space-y-3">
              {(['q', 'page', 'perPage'] as const).map(field => <label key={field} className="block text-sm text-slate-300">
                {field === 'q' ? 'Search product text' : field === 'page' ? 'Page number' : 'Products per page (not daily quota)'}
                <input type={field === 'q' ? 'text' : 'number'} min={field === 'q' ? undefined : 1} value={queryParams[field]}
                  onChange={e => setQueryParams({ ...queryParams, [field]: e.target.value })}
                  className="block w-full bg-slate-900 border border-slate-700 rounded-lg p-2" />
              </label>)}
            </div>}

            {/* Execute Button */}
            <button
              onClick={executeRequest}
              disabled={loading}
              className="w-full mt-6 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-700 disabled:cursor-not-allowed text-white font-medium py-3 rounded-xl transition-all flex items-center justify-center gap-2 shadow-lg shadow-indigo-500/25"
            >
              {loading ? (
                <>
                  <RefreshCw className="w-5 h-5 animate-spin" />
                  Executing...
                </>
              ) : (
                <>
                  <Play className="w-5 h-5" />
                  Execute Request
                </>
              )}
            </button>
          </div>

          <CodeSnippet endpoint={buildApiUrl()} />
        </div>

        {/* RIGHT PANEL: Response Display */}
        <div className="space-y-4">
          <div className="glass-card rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-white flex items-center gap-2">
                <Database className="w-5 h-5 text-indigo-400" />
                API Response
              </h2>
              {responseTime !== null && (
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  {responseTime}ms
                </span>
              )}
            </div>

            {!response ? (
              <div className="flex flex-col items-center justify-center py-12 text-center">
                <Play className="w-12 h-12 text-slate-600 mb-3" />
                <p className="text-sm font-medium text-slate-300">No response yet</p>
                <p className="text-xs text-slate-500 mt-1">Click &quot;Execute Request&quot; to test your API</p>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Status Banner */}
                <div className={`p-4 rounded-lg border ${
                  response.success
                    ? "bg-emerald-500/10 border-emerald-500/30"
                    : "bg-red-500/10 border-red-500/30"
                }`}>
                  <div className="flex items-start gap-3">
                    {response.success ? (
                      <Check className="w-5 h-5 text-emerald-400 flex-shrink-0 mt-0.5" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-400 flex-shrink-0 mt-0.5" />
                    )}
                    <div>
                      <h3 className={`text-sm font-bold ${response.success ? "text-emerald-400" : "text-red-400"}`}>
                        {response.success ? "Success" : response.error || "Error"}
                      </h3>
                      {response.message && (
                        <p className="text-xs text-slate-400 mt-1">{response.message}</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Schema Note */}
                {response.products && response.products.length > 0 && (
                  <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg px-4 py-3 text-xs text-indigo-300">
                    <p className="font-bold mb-1">📦 Response Schema Note</p>
                    <p className="text-indigo-300/70 leading-relaxed">
                      Each product includes a <code className="bg-indigo-500/20 px-1 rounded">variants</code> array with the full list of options (flavor, size, price, SKU, expirationDate).
                      The root-level <code className="bg-indigo-500/20 px-1 rounded">price</code> and <code className="bg-indigo-500/20 px-1 rounded">size</code> fields reflect the{' '}
                      <strong>lowest-priced variant</strong> for convenience — use the <code className="bg-indigo-500/20 px-1 rounded">variants</code> array for the full options list.
                    </p>
                  </div>
                )}

                {/* Products List */}
                {response.products && response.products.length > 0 && (
                  <div>
                    <h4 className="text-xs font-bold text-slate-400 mb-3">PRODUCTS ({response.products.length})</h4>
                    <div className="space-y-2 max-h-[500px] overflow-y-auto">
                      {response.products.map((product, index) => (
                        <div
                          key={product.id || index}
                          className="bg-slate-950 border border-slate-800 rounded-lg p-3 hover:border-slate-700 transition-colors"
                        >
                          <button
                            onClick={() => setExpandedProduct(expandedProduct === index ? null : index)}
                            className="w-full flex items-center justify-between text-left"
                          >
                            <div className="flex items-center gap-3 flex-1">
                              <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                product.segment === "Pharmacy" ? "bg-green-500/20 text-green-400" :
                                product.segment === "Hardware" ? "bg-orange-500/20 text-orange-400" :
                                "bg-blue-500/20 text-blue-400"
                              }`}>
                                {product.segment}
                              </span>
                              <div className="flex-1">
                                <div className="text-sm font-medium text-white">{product.name}</div>
                                <div className="text-xs text-slate-500">SKU: {product.sku}</div>
                              </div>
                            </div>
                            {expandedProduct === index ? (
                              <ChevronDown className="w-4 h-4 text-slate-500" />
                            ) : (
                              <ChevronRight className="w-4 h-4 text-slate-500" />
                            )}
                          </button>
                          
                          {expandedProduct === index && (
                            <div className="mt-3 pt-3 border-t border-slate-800">
                              <pre className="text-xs text-slate-400 overflow-x-auto">
                                {JSON.stringify(product, null, 2)}
                              </pre>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Raw JSON Response */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <h4 className="text-xs font-bold text-slate-400">RAW JSON</h4>
                    <button
                      onClick={() => void copyToClipboard(JSON.stringify(response, null, 2))}
                      aria-label="Copy response" title="Copy response"
                      className="p-1 rounded hover:bg-slate-800 text-slate-500 hover:text-slate-300 transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto max-h-64 font-mono">
                    {JSON.stringify(response, null, 2)}
                  </pre>
                </div>

                {/* Download Button */}
                <button
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(response, null, 2)], { type: 'application/json' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `api-response-${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                  className="w-full bg-slate-800 hover:bg-slate-700 text-slate-300 font-medium py-2 rounded-lg transition-all flex items-center justify-center gap-2 text-sm"
                >
                  <Download className="w-4 h-4" />
                  Download Response
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
