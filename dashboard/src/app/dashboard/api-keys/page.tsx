"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { KeyboardEvent } from "react";
import Link from "next/link";
import { AlertTriangle, Check, CheckCircle2, Clock, Code, Copy, Key, RotateCw, Shield, Trash2 } from "lucide-react";
import type { User } from "firebase/auth";
import { useAuth } from "@/lib/firebase/auth-context";
import { apiKeyRequest, ApiKeyRequestError } from "@/lib/api-keys";
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

type OneTimeReplacement = { id: string; name: string; secret: string };

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
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  const [replacement, setReplacement] = useState<OneTimeReplacement | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [replaceError, setReplaceError] = useState("");
  const [copyFeedback, setCopyFeedback] = useState("");
  const [serverUpgradeRequired, setServerUpgradeRequired] = useState(false);
  const listGeneration = useRef(0);
  const replacingRef = useRef(false);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);
  const copyRef = useRef<HTMLButtonElement>(null);
  const dismissRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const copyTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const upgradeRequired = entitlementStatus === "upgrade_required" || serverUpgradeRequired;

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
  useEffect(() => { if (selectedKey) cancelRef.current?.focus(); }, [selectedKey]);
  useEffect(() => { if (replacement) copyRef.current?.focus(); }, [replacement]);
  useEffect(() => () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
  }, []);

  const closeConfirmation = () => {
    if (replacingRef.current) return;
    setSelectedKey(null);
    setReplaceError("");
    returnFocusRef.current?.focus();
  };

  const replaceKey = async () => {
    if (!selectedKey || replacingRef.current || upgradeRequired || entitlementStatus === null) return;
    replacingRef.current = true;
    setReplacing(true);
    setReplaceError("");
    try {
      const data = await apiKeyRequest(user, `/${encodeURIComponent(selectedKey.id)}/replace`, { method: "POST" });
      if (data.success !== true || typeof data.key !== "string" || !data.key || typeof data.id !== "string") {
        throw new Error("Replacement may have succeeded, but the secret was not delivered. Check the active key list before trying again.");
      }
      setSelectedKey(null);
      setReplacement({ id: data.id, name: data.name || selectedKey.name, secret: data.key });
      setCopyFeedback("");
      void fetchApiKeys();
    } catch (error) {
      if (error instanceof ApiKeyRequestError && error.code === "UPGRADE_REQUIRED") setServerUpgradeRequired(true);
      if (!(error instanceof ApiKeyRequestError)) {
        setReplaceError("Connection lost. Check the refreshed active key list before retrying; the old key may already be revoked.");
        void fetchApiKeys();
      } else {
        setReplaceError(error instanceof Error ? error.message : "Unable to replace this API key.");
      }
    } finally {
      replacingRef.current = false;
      setReplacing(false);
    }
  };

  const copySecret = async () => {
    if (!replacement) return;
    try {
      await navigator.clipboard.writeText(replacement.secret);
      setCopyFeedback("Copied");
      if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
      copyTimerRef.current = setTimeout(() => setCopyFeedback(""), 2500);
    } catch {
      setCopyFeedback("Copy failed. Select and save the displayed key before closing.");
    }
  };

  const dismissReplacement = () => {
    if (copyTimerRef.current) clearTimeout(copyTimerRef.current);
    setReplacement(null);
    setCopyFeedback("");
    headingRef.current?.focus();
  };

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

  const trapFocus = (event: KeyboardEvent<HTMLDivElement>, first: HTMLButtonElement | null,
    last: HTMLButtonElement | null, close: () => void) => {
    if (event.key === "Escape") { event.preventDefault(); close(); }
    if (event.key !== "Tab" || !first || !last) return;
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  };

  return (
    <div className="w-full px-6 lg:px-8 space-y-6 pb-10">
      <div>
        <h1 ref={headingRef} tabIndex={-1} className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
          <Key className="w-8 h-8 text-indigo-400" /> API Keys
        </h1>
        <p className="text-slate-400">Manage, replace, or revoke existing API credentials.</p>
        <p className="text-sm text-slate-400 mt-2">New API keys are created from <Link href="/dashboard/products" className="text-cyan-300 underline">Products</Link> when configuring an integration.</p>
      </div>

      {upgradeRequired && <div role="status" className="rounded-xl border border-amber-500/40 bg-amber-950/20 p-5 text-amber-100">
        Free Trial Ended. Existing keys remain visible and revocable, but replacement and protected API access require paid Pro or Pro Max.{" "}
        <Link href="/dashboard/plan-billing#upgrade" className="font-semibold text-cyan-300">Upgrade to Pro or Pro Max</Link>
      </div>}
      {entitlementStatus === null && <p role="status" className="text-slate-400">Verifying account entitlement before key replacement…</p>}

      <div className="glass-card rounded-xl p-6 border-l-4 border-amber-500">
        <h2 className="text-lg font-semibold text-white mb-2 flex items-center gap-2"><Shield className="w-5 h-5 text-amber-400" /> Keep Your Keys Secure</h2>
        <p className="text-sm text-slate-300">Secrets are shown only once. Store them securely and never put them in public repositories or client-side code. Replacing a key immediately revokes the old credential; revoking alone creates nothing.</p>
      </div>
      <CustomerUsageSummary />
      <p className="text-sm text-slate-400">Free Trial permits one active API key with 50–500 currently linked products for 7 days. API calls do not consume products. Manage the catalog in Products or securely replace your existing key. After expiry, upgrade to Pro or Pro Max; there is no Free monthly fallback.</p>
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
                  const currentSecret = replacement?.id === apiKey.id ? replacement.secret : null;
                  return <article key={apiKey.id} className="bg-slate-900/50 border border-slate-700 rounded-xl p-6">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 mb-4">
                      <div>
                        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                          {apiKey.name} <span className="text-xs text-emerald-400"><CheckCircle2 className="inline w-3 h-3" /> Active</span>
                        </h3>
                        <p className="text-xs text-slate-400 flex items-center gap-1"><Clock className="w-3 h-3" /> Created {formatDate(apiKey.createdAt)}</p>
                      </div>
                      <div className="flex flex-col sm:flex-row gap-2">
                        {!upgradeRequired && entitlementStatus !== null && !currentSecret && <button
                          onClick={event => { returnFocusRef.current = event.currentTarget; setReplaceError(""); setSelectedKey(apiKey); }}
                          className="px-3 py-2 rounded-lg bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/30 text-indigo-200 text-sm font-medium inline-flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-indigo-300">
                          <RotateCw className="w-4 h-4" aria-hidden="true" /> Replace API Key
                        </button>}
                        <button onClick={() => void revokeKey(apiKey.id, apiKey.name)}
                          className="px-3 py-2 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 text-red-300 text-sm font-medium inline-flex items-center justify-center gap-2 focus-visible:ring-2 focus-visible:ring-red-300">
                          <Trash2 className="w-4 h-4" aria-hidden="true" /> Revoke
                        </button>
                      </div>
                    </div>
                    <p className="text-xs font-medium text-slate-400 mb-2">API KEY</p>
                    <div className="rounded-lg bg-slate-950 border border-slate-700 px-4 py-3 font-mono text-sm text-indigo-300 break-all">
                      {currentSecret || `${apiKey.keyPrefix}••••••••`}
                    </div>
                    {currentSecret ? <button onClick={() => void copySecret()}
                      className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-white focus-visible:ring-2 focus-visible:ring-emerald-300">
                      <Copy className="w-4 h-4" aria-hidden="true" /> Copy API Key
                    </button> : <p className="mt-2 text-xs text-amber-200">Secret shown only once</p>}
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

      {selectedKey && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
        <div role="alertdialog" aria-modal="true" aria-labelledby="replace-title" aria-describedby="replace-description"
          onKeyDown={event => trapFocus(event, cancelRef.current, confirmRef.current, closeConfirmation)}
          className="glass-card w-full max-w-lg rounded-2xl border border-amber-500/40 p-6 shadow-2xl">
          <AlertTriangle className="w-8 h-8 text-amber-400 mb-4" aria-hidden="true" />
          <h2 id="replace-title" className="text-xl font-bold text-white">Replace this API key?</h2>
          <p id="replace-description" className="mt-3 text-sm text-slate-200">The current API key will stop working immediately. Any integration using it must be updated with the replacement key. The new API key will be displayed only once.</p>
          {replaceError && <p role="alert" className="mt-4 text-sm text-red-300">{replaceError}</p>}
          <div className="mt-6 flex flex-col sm:flex-row gap-3">
            <button ref={cancelRef} onClick={closeConfirmation} disabled={replacing}
              className="rounded-lg bg-slate-800 px-4 py-3 text-white disabled:opacity-50">Cancel</button>
            <button ref={confirmRef} onClick={() => void replaceKey()} disabled={replacing || upgradeRequired}
              className="rounded-lg bg-amber-600 px-4 py-3 font-semibold text-white disabled:opacity-50">
              {replacing ? "Replacing…" : "Replace API Key"}
            </button>
          </div>
        </div>
      </div>}

      {replacement && <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4">
        <div role="dialog" aria-modal="true" aria-labelledby="replacement-title" aria-describedby="replacement-description"
          onKeyDown={event => trapFocus(event, copyRef.current, dismissRef.current, dismissReplacement)}
          className="glass-card w-full max-w-lg rounded-2xl border border-emerald-500/40 p-6 shadow-2xl">
          <CheckCircle2 className="w-10 h-10 text-emerald-400 mb-4" aria-hidden="true" />
          <h2 id="replacement-title" className="text-xl font-bold text-white">API Key Replaced</h2>
          <p className="mt-2 text-slate-200">Your previous key has been revoked.</p>
          <p className="mt-4 text-xs font-medium text-emerald-300">New API Key — shown once</p>
          <div className="mt-2 rounded-lg border border-emerald-500/30 bg-slate-950 p-4 font-mono text-sm text-emerald-200 break-all select-all">
            {replacement.secret}
          </div>
          <p id="replacement-description" className="mt-4 text-sm text-amber-200">Save this key now. For security, InventaAPI will not display it again.</p>
          <p role="status" aria-live="polite" className="mt-2 min-h-5 text-sm text-emerald-300">{copyFeedback}</p>
          <div className="mt-5 flex flex-col sm:flex-row gap-3">
            <button ref={copyRef} onClick={() => void copySecret()}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-emerald-600 px-4 py-3 font-semibold text-white focus-visible:ring-2 focus-visible:ring-emerald-300">
              {copyFeedback === "Copied" ? <Check className="w-4 h-4" aria-hidden="true" /> : <Copy className="w-4 h-4" aria-hidden="true" />}
              Copy API Key
            </button>
            <button ref={dismissRef} onClick={dismissReplacement}
              className="rounded-lg bg-slate-800 px-4 py-3 text-white">I’ve Saved My Key</button>
          </div>
        </div>
      </div>}
    </div>
  );
}
