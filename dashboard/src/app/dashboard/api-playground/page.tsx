"use client";

import { useState, useEffect } from "react";
import { 
  Play, Copy, Check, Key, Database, AlertCircle, 
  Code, Download, RefreshCw, Sparkles, Zap, ChevronDown, ChevronRight
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useAuth } from "@/lib/firebase/auth-context";

interface ApiResponse {
  success: boolean;
  api_key_info?: {
    business_name: string;
    email: string;
    plan: string;
    authorized_products: number;
  };
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    returned: number;
  };
  products?: any[];
  stats?: any;
  error?: string;
  message?: string;
}

export default function ApiPlaygroundPage() {
  const searchParams = useSearchParams();
  const preselectedProducts = searchParams.get('products');
  const { user } = useAuth();

  // State Management
  const [apiKey, setApiKey] = useState("");
  const [endpoint, setEndpoint] = useState("/daas/v1/catalog");
  const [method, setMethod] = useState("GET");
  const [queryParams, setQueryParams] = useState({
    segment: "",
    category: "",
    search: "",
    limit: "100",
    offset: "0"
  });
  
  const [response, setResponse] = useState<ApiResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [responseTime, setResponseTime] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [expandedProduct, setExpandedProduct] = useState<number | null>(null);

  // Auto-fetch the user's first active API key
  useEffect(() => {
    const fetchKey = async () => {
      if (!user) return;
      try {
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
        const res = await fetch(`${apiUrl}/api/v1/api-keys?userId=${user.uid}`);
        const data = await res.json();
        
        if (data.success && data.keys && data.keys.length > 0) {
          const activeKey = data.keys.find((k: any) => k.status === 'active');
          if (activeKey) {
            setApiKey(activeKey.key);
          }
        }
      } catch (err) {
        console.error("Failed to fetch auto-fill API key:", err);
      }
    };
    
    if (!apiKey) {
      fetchKey();
    }
  }, [user, apiKey]);

  // Build full API URL with query params
  const buildApiUrl = () => {
    const baseUrl = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
    const url = new URL(`${baseUrl}${endpoint}`);
    
    Object.entries(queryParams).forEach(([key, value]) => {
      if (value) {
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
      
      // Inject success based on HTTP status so the UI renders correctly
      // even if the backend doesn't explicitly send { success: true }
      if (res.ok && data.success === undefined) {
        data.success = true;
      } else if (!res.ok && data.success === undefined) {
        data.success = false;
        data.error = data.error || `HTTP Error ${res.status}`;
      }

      setResponse(data);

    } catch (error: any) {
      console.error("API Request Error:", error);
      setResponse({
        success: false,
        error: "Network Error",
        message: error.message || "Failed to connect to API server"
      });
    } finally {
      setLoading(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  // Generate code examples
  const getCodeExample = (language: string) => {
    const url = buildApiUrl();
    
    const examples: Record<string, string> = {
      javascript: `// JavaScript (Fetch API)
fetch('${url}', {
  method: '${method}',
  headers: {
    'x-api-key': '${apiKey}',
    'Content-Type': 'application/json'
  }
})
.then(response => response.json())
.then(data => console.log(data))
.catch(error => console.error('Error:', error));`,

      python: `# Python (Requests)
import requests

url = '${url}'
headers = {
    'x-api-key': '${apiKey}',
    'Content-Type': 'application/json'
}

response = requests.get(url, headers=headers)
data = response.json()
print(data)`,

      curl: `# cURL Command
curl -X ${method} '${url}' \\
  -H 'x-api-key: ${apiKey}' \\
  -H 'Content-Type: application/json'`,

      php: `<?php
// PHP (cURL)
$url = '${url}';
$headers = [
    'x-api-key: ${apiKey}',
    'Content-Type: application/json'
];

$ch = curl_init($url);
curl_setopt($ch, CURLOPT_RETURNTRANSFER, true);
curl_setopt($ch, CURLOPT_HTTPHEADER, $headers);

$response = curl_exec($ch);
$data = json_decode($response, true);
curl_close($ch);

print_r($data);
?>`
    };

    return examples[language] || examples.javascript;
  };

  const [activeCodeTab, setActiveCodeTab] = useState("javascript");

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight text-white mb-2">API Playground</h1>
          <p className="text-slate-400">Test your custom API endpoints with live product data</p>
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
              You've selected {preselectedProducts.split(',').length} products. Generate an API key to test access to these specific products.
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
                  type="text"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="daas_xxxxxxxxxxxxxxxxxxxxxxxx"
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-xl pl-11 pr-4 py-3 text-sm text-slate-200 font-mono focus:outline-none focus:border-indigo-500/50 focus:ring-1 focus:ring-indigo-500/50 transition-all"
                />
              </div>
              <p className="text-xs text-slate-500 mt-1">Enter your API key to authenticate requests</p>
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
                <option value="/api/v1/products">GET /api/v1/products (Admin)</option>
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Use <code className="text-indigo-400">/daas/v1/catalog</code> — the primary endpoint that returns only products linked to your API key.
              </p>
            </div>

            {/* Query Parameters */}
            {endpoint === "/api/v1/products" && (
              <div className="space-y-3">
                <label className="text-sm font-medium text-slate-300 block">QUERY PARAMETERS (Optional)</label>
                
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Segment (e.g., Pharmacy)"
                      value={queryParams.segment}
                      onChange={(e) => setQueryParams({...queryParams, segment: e.target.value})}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Category"
                      value={queryParams.category}
                      onChange={(e) => setQueryParams({...queryParams, category: e.target.value})}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>

                <input
                  type="text"
                  placeholder="Search (name or description)"
                  value={queryParams.search}
                  onChange={(e) => setQueryParams({...queryParams, search: e.target.value})}
                  className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
                />

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <input
                      type="number"
                      placeholder="Limit (default: 100)"
                      value={queryParams.limit}
                      onChange={(e) => setQueryParams({...queryParams, limit: e.target.value})}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                  <div>
                    <input
                      type="number"
                      placeholder="Offset (default: 0)"
                      value={queryParams.offset}
                      onChange={(e) => setQueryParams({...queryParams, offset: e.target.value})}
                      className="w-full bg-slate-900/50 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500/50"
                    />
                  </div>
                </div>
              </div>
            )}

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

          {/* Code Examples */}
          <div className="glass-card rounded-xl p-6">
            <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2">
              <Code className="w-5 h-5 text-indigo-400" />
              Code Examples
            </h2>

            <div className="flex gap-2 mb-4">
              {['javascript', 'python', 'curl', 'php'].map((lang) => (
                <button
                  key={lang}
                  onClick={() => setActiveCodeTab(lang)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    activeCodeTab === lang
                      ? "bg-indigo-500 text-white"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {lang.charAt(0).toUpperCase() + lang.slice(1)}
                </button>
              ))}
            </div>

            <div className="relative">
              <pre className="bg-slate-950 border border-slate-800 rounded-lg p-4 text-xs text-slate-300 overflow-x-auto font-mono">
                {getCodeExample(activeCodeTab)}
              </pre>
              <button
                onClick={() => copyToClipboard(getCodeExample(activeCodeTab))}
                className="absolute top-2 right-2 p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
              </button>
            </div>
          </div>
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
                <p className="text-xs text-slate-500 mt-1">Click "Execute Request" to test your API</p>
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

                {/* API Key Info */}
                {response.api_key_info && (
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                    <h4 className="text-xs font-bold text-slate-400 mb-2">API KEY INFO</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Business:</span>
                        <span className="text-slate-300 font-medium">{response.api_key_info.business_name}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Plan:</span>
                        <span className="text-indigo-400 font-medium">{response.api_key_info.plan}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Authorized Products:</span>
                        <span className="text-emerald-400 font-medium">{response.api_key_info.authorized_products}</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Pagination Info */}
                {response.pagination && (
                  <div className="bg-slate-950 border border-slate-800 rounded-lg p-4">
                    <h4 className="text-xs font-bold text-slate-400 mb-2">PAGINATION</h4>
                    <div className="space-y-1 text-xs">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Total Products:</span>
                        <span className="text-slate-300 font-medium">{response.pagination.total}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Returned:</span>
                        <span className="text-emerald-400 font-medium">{response.pagination.returned}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Limit:</span>
                        <span className="text-slate-300 font-medium">{response.pagination.limit}</span>
                      </div>
                    </div>
                  </div>
                )}

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
                      onClick={() => copyToClipboard(JSON.stringify(response, null, 2))}
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
