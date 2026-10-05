"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CheckCircle2, Clock, Code, Key, Shield, Trash2 } from "lucide-react";
import type { User } from "firebase/auth";
import { useAuth } from "@/lib/firebase/auth-context";
import { apiKeyRequest } from "@/lib/api-keys";
import { REVOCATION_WARNING } from "@/lib/api-key-generation";
import CustomerUsageSummary from "@/components/reports/CustomerUsageSummary";
import RequestHistory from "@/components/api/RequestHistory";
import CodeSnippet from "@/components/shared/CodeSnippet";

interface ApiKey {
  id: string;
  keyPrefix: string;
  name: string;
  plan: string;
  createdAt: string | null;
  lastUsed: string | null;
  status: "active" | "revoked";
}

export default function ApiKeysPage() {
  const { user, entitlement } = useAuth();
  return user ? (
    <AccountKeysSession
      key={user.uid}
      user={user}
      entitlementStatus={entitlement?.subscription_status ?? null}
    />
  ) : null;
}

// A route reload, route exit, or account switch destroys this component and
// its one-time secret. Neither list refreshes nor entitlement updates do.
function AccountKeysSession({ user, entitlementStatus }: {
  user: User;
  entitlementStatus: string | null;
}) {
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [listError, setListError] = useState(false);
  const [showCodeSnippet, setShowCodeSnippet] = useState<Record<string, boolean>>({});
  const listGeneration = useRef(0);
  const upgradeRequired = entitlementStatus === "upgrade_required";

  const fetchApiKeys = useCallback(async () => {
    const ticket = ++listGeneration.current;
    setLoading(true);
    setListError(false);
    try {
      const data = await apiKeyRequest(user);
      if (data.success !== true || !Array.isArray(data.keys)) throw new Error("Invalid key response");
      if (ticket === listGeneration.current) setApiKeys(data.keys as ApiKey[]);
    } catch {
      if (ticket === listGeneration.current) { setApiKeys([]); setListError(true); }
    } finally {
      if (ticket === listGeneration.current) setLoading(false);
    }
  }, [user]);
  const invalidateList = useCallback(() => { listGeneration.current++; }, []);

  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void fetchApiKeys(); });
    return () => { active = false; invalidateList(); };
  }, [fetchApiKeys, invalidateList]);
  const revokeKey = async (id: string, name: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to revoke "${name}"?\n\n` +
      `This action cannot be undone. Integrations using this key will stop working.\n\n` +
      `${REVOCATION_WARNING}\n\nSelect OK to revoke without creating a replacement.`
    );
    if (!confirmed) return;
    try {
      await apiKeyRequest(user, `/${encodeURIComponent(id)}`, { method: "DELETE" });
      void fetchApiKeys();
    } catch {
      window.alert("Failed to revoke API key. Please try again.");
    }
  };

  const formatDate = (value: string | null) => {
    if (!value) return "Never";
    const date = new Date(value);
    return Number.isFinite(date.getTime())
      ? date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
      : "Not recorded";
  };

  return (
    <div className="w-full px-6 lg:px-8 space-y-6 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
          <Key className="w-8 h-8 text-indigo-400" /> API Keys
        </h1>
        <p className="text-slate-400">Manage or revoke existing API credentials.</p>
        <p className="text-sm text-slate-400 mt-2">New API keys are created from <Link href="/dashboard/products" className="text-cyan-300 underline">Products</Link> when configuring an integration.</p>
      </div>

      {upgradeRequired && <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 text-amber-100">
        Free Trial Ended. Existing keys remain visible and revocable, but protected API access requires paid Pro or Pro Max.{" "}
        <Link href="/dashboard/plan-billing#upgrade" className="font-semibold text-cyan-300">Upgrade to Pro or Pro Max</Link>
      </div>}
      {entitlementStatus === null && <p role="status" className="text-slate-400">Verifying account entitlement…</p>}

      <div className="glass-card rounded-xl p-6 border-l-4 border-amber-500">
        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><Shield className="w-5 h-5 text-amber-400" /> Keep Your Keys Secure</h2>
        <p className="text-sm text-slate-300">Secrets are shown only once. Store them securely and never put them in public repositories or client-side code. Revoking a key immediately disables that credential; revocation does not create another key.</p>
      </div>
      <CustomerUsageSummary />
      <p className="text-sm text-slate-400">Free Trial permits one active API key with up to 50 currently linked products for 7 days. API calls do not consume products. Manage the catalog and create keys in Products. After expiry, upgrade to Pro or Pro Max; there is no Free monthly fallback.</p>
      <RequestHistory />

      <section className="glass-card rounded-xl border border-slate-700">
        <div className="p-6 border-b border-slate-700">
          <h2 className="text-xl font-semibold text-white">Active API Keys</h2>
          <p className="text-sm text-slate-400">{loading ? "Loading keys…" : listError ? "Key list unavailable"
            : apiKeys.length === 0 ? "No API keys yet" : `You have ${apiKeys.length} active key${apiKeys.length === 1 ? "" : "s"}`}</p>
        </div>
        <div className="p-6">
          {loading ? <p role="status" className="text-slate-400">Loading API keys…</p>
            : listError ? <div role="alert"><p>Unable to load API keys. Previous rows have been cleared.</p>
              <button onClick={() => void fetchApiKeys()} className="text-indigo-300">Retry key list</button></div>
              : apiKeys.length === 0 ? <div className="text-center py-12 border-2 border-dashed border-slate-700 rounded-xl bg-slate-900/50">
                <Key className="w-10 h-10 text-slate-500 mx-auto mb-4" aria-hidden="true" />
                <h3 className="text-lg font-semibold text-white mb-2">No API keys yet</h3>
                <p className="text-sm text-slate-400 mb-6">API keys are created from Products when you configure an integration.</p>
                <Link href="/dashboard/products" className="inline-flex rounded-lg bg-indigo-600 px-5 py-3 text-white font-medium">Go to Products</Link>
              </div>
                : <div className="space-y-4">{apiKeys.map(apiKey => {
                  return <article key={apiKey.id} className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          {apiKey.name} <span className="text-xs text-emerald-400"><CheckCircle2 className="inline w-3 h-3" /> Active</span>
                        </h3>
                        <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Created {formatDate(apiKey.createdAt)}</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        <button onClick={() => void revokeKey(apiKey.id, apiKey.name)}
                          className="px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-medium inline-flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-red-300">
                          <Trash2 className="w-4 h-4" aria-hidden="true" /> Revoke
                        </button>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-slate-400 mb-2">API KEY</p>
                    <div className="rounded-lg bg-slate-950 border border-slate-700 px-4 py-3 font-mono text-sm text-indigo-300 break-all">
                      {`${apiKey.keyPrefix}••••••••`}
                    </div>
                    <p className="mt-2 text-xs text-amber-200">Secret shown only once</p>
                    <div className="grid grid-cols-2 gap-4 mt-4 pt-4 border-t border-slate-700 text-sm">
                      <div><p className="text-xs text-slate-400">LAST USED</p>{formatDate(apiKey.lastUsed)}</div>
                      <div><p className="text-xs text-slate-400">PLAN</p>{apiKey.plan}</div>
                    </div>
                    <button onClick={() => setShowCodeSnippet(prev => ({ ...prev, [apiKey.id]: !prev[apiKey.id] }))}
                      className="mt-4 w-full rounded-lg bg-slate-800 px-4 py-2 text-slate-200 inline-flex items-center justify-center gap-2">
                      <Code className="w-4 h-4" /> {showCodeSnippet[apiKey.id] ? "Hide" : "Show"} Integration Code Examples
                    </button>
                    {showCodeSnippet[apiKey.id] && <div className="mt-4"><CodeSnippet /></div>}
                  </article>;
                })}</div>}
        </div>
      </section>

    </div>
  );
}
