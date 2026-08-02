"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

interface CodeSnippetProps {
  apiKey: string;
  apiUrl?: string;
}

export default function CodeSnippet({ apiKey, apiUrl = "http://localhost:5001" }: CodeSnippetProps) {
  const [activeTab, setActiveTab] = useState<"curl" | "javascript" | "python">("curl");
  const [copied, setCopied] = useState(false);

  const snippets = {
    curl: `# cURL Command - Get Your Custom Product Catalog
curl -X GET '${apiUrl}/daas/v1/catalog' \\
  -H 'x-api-key: ${apiKey}' \\
  -H 'Content-Type: application/json'`,

    javascript: `// JavaScript (Fetch API)
const apiKey = '${apiKey}';
const apiUrl = '${apiUrl}/daas/v1/catalog';

fetch(apiUrl, {
  method: 'GET',
  headers: {
    'x-api-key': apiKey,
    'Content-Type': 'application/json'
  }
})
  .then(response => response.json())
  .then(data => {
    console.log('Products:', data.products);
    console.log('Total:', data.meta.count);
  })
  .catch(error => console.error('Error:', error));`,

    python: `# Python (requests library)
import requests

api_key = '${apiKey}'
api_url = '${apiUrl}/daas/v1/catalog'

headers = {
    'x-api-key': api_key,
    'Content-Type': 'application/json'
}

response = requests.get(api_url, headers=headers)
data = response.json()

print(f"Total Products: {data['meta']['count']}")
for product in data['products']:
    print(f"- {product['name']} (SKU: {product['sku']})")`
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(snippets[activeTab]);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="glass-card rounded-xl border border-slate-700 overflow-hidden">
      {/* Header */}
      <div className="bg-slate-900/80 border-b border-slate-700 p-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">Integration Code Examples</h3>
        <button
          onClick={handleCopy}
          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-medium transition-all flex items-center gap-2"
        >
          {copied ? (
            <>
              <Check className="w-3 h-3 text-emerald-400" />
              <span className="text-emerald-400">Copied!</span>
            </>
          ) : (
            <>
              <Copy className="w-3 h-3" />
              Copy Code
            </>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="bg-slate-900/50 border-b border-slate-700 flex">
        <button
          onClick={() => setActiveTab("curl")}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "curl"
              ? "text-indigo-400 border-indigo-500 bg-slate-800/50"
              : "text-slate-400 border-transparent hover:text-slate-300 hover:bg-slate-800/30"
          }`}
        >
          cURL
        </button>
        <button
          onClick={() => setActiveTab("javascript")}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "javascript"
              ? "text-indigo-400 border-indigo-500 bg-slate-800/50"
              : "text-slate-400 border-transparent hover:text-slate-300 hover:bg-slate-800/30"
          }`}
        >
          JavaScript
        </button>
        <button
          onClick={() => setActiveTab("python")}
          className={`px-4 py-3 text-sm font-medium transition-colors border-b-2 ${
            activeTab === "python"
              ? "text-indigo-400 border-indigo-500 bg-slate-800/50"
              : "text-slate-400 border-transparent hover:text-slate-300 hover:bg-slate-800/30"
          }`}
        >
          Python
        </button>
      </div>

      {/* Code Content */}
      <div className="bg-slate-950 p-4 overflow-x-auto">
        <pre className="text-xs font-mono text-slate-300 leading-relaxed">
          <code>{snippets[activeTab]}</code>
        </pre>
      </div>
    </div>
  );
}
