"use client";
import { useState } from "react";
import Link from "next/link";
import { Check, Copy, Key, X } from "lucide-react";

// One row per API key the products went into. A newly created key carries its
// secret here once; it can be copied again later from the API Keys page.
export type PaidAddResult = {
  segment: string; keyId: string; name: string; created: boolean; added: number; total: number; key?: string;
};

export default function PaidKeyResultModal({ results, onClose }: { results: PaidAddResult[]; onClose: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const [copyError, setCopyError] = useState("");
  const created = results.filter(result => result.created && result.key);
  const copy = async (result: PaidAddResult) => {
    try {
      await navigator.clipboard.writeText(result.key!);
      setCopied(result.keyId); setCopyError("");
      setTimeout(() => setCopied(current => (current === result.keyId ? null : current)), 2000);
    } catch { setCopyError("Copy failed. Select the key and copy it manually."); }
  };
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/90 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="paid-key-result-title"
        className="w-full max-w-lg glass-card rounded-2xl border border-slate-700 shadow-2xl p-6 sm:p-8 relative max-h-[90vh] overflow-y-auto">
        <button type="button" onClick={onClose} aria-label="Close" className="absolute top-4 right-4 text-slate-400 hover:text-white transition-colors">
          <X className="w-5 h-5" />
        </button>
        <div className="w-12 h-12 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center mb-4">
          <Check className="w-6 h-6 text-emerald-400" />
        </div>
        <h3 id="paid-key-result-title" className="text-xl font-bold text-white mb-1">Products added</h3>
        <p className="text-sm text-slate-400 mb-5">
          {created.length ? "Copy each new key now and store it securely. You can copy it again later from API Keys." : "Your API key now includes these products. No new key was needed."}
        </p>
        <ul className="space-y-3">
          {results.map(result => (
            <li key={result.keyId} className="rounded-xl border border-slate-700 bg-slate-800/40 p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 font-semibold text-white"><Key className="h-4 w-4 text-indigo-400" />{result.name || `${result.segment} API key`}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    {result.segment} · {result.added} {result.added === 1 ? "product" : "products"} added · {result.total} in this key
                    {result.created ? " · new key" : ""}
                  </p>
                </div>
              </div>
              {result.created && result.key && (
                <div className="mt-3 flex items-center gap-2">
                  <code className="code-panel min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-xs">{result.key}</code>
                  <button type="button" onClick={() => void copy(result)}
                    className="shrink-0 inline-flex items-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-600">
                    {copied === result.keyId ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                    {copied === result.keyId ? "Copied" : "Copy"}
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {copyError && <p role="alert" className="mt-3 text-sm text-rose-300">{copyError}</p>}
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <Link href="/dashboard/api-keys" className="rounded-xl border border-slate-700 bg-slate-800 px-4 py-2.5 text-sm font-medium text-slate-200 hover:bg-slate-700">Go to API Keys</Link>
          <button type="button" onClick={onClose} className="rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-600">Done</button>
        </div>
      </div>
    </div>
  );
}
