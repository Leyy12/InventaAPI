"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Settings, Save, Server, Shield } from 'lucide-react';
import { useAdminAuth } from '@/lib/supabase/admin-auth-context';
import BackupRestoreCard from '@/components/admin/BackupRestoreCard';
import { TRIAL_MAX_PRODUCTS, TRIAL_MAX_ACTIVE_KEYS } from '../../../../functions/entitlement-limits.mjs';

type PlanLimits = { free_trial: number | null; pro: number; pro_max: number | null };
type Configuration = { maintenanceMode: boolean; allowNewRegistrations: boolean; planRequestLimits: PlanLimits;
  maintenanceStartsAt: string | null; maintenanceEndsAt: string | null };
type Snapshot = { settings: Configuration; version: string; source: 'stored' | 'defaults'; warnings: string[]; planLimitPeriod: string };
type Information = { apiVersion: string | null; databaseStatus: 'Connected' | 'Unavailable' | 'Not configured'; checkedAt: string; uptime: string };
type Phase = 'loading' | 'ready' | 'missing' | 'unauthorized' | 'unavailable' | 'conflict';
const initial: Configuration = { maintenanceMode: false, allowNewRegistrations: true, planRequestLimits: { free_trial: null, pro: 500, pro_max: null },
  maintenanceStartsAt: null, maintenanceEndsAt: null };
const editableFields = ['maintenanceMode', 'allowNewRegistrations', 'maintenanceStartsAt', 'maintenanceEndsAt'] as const;
// The schedule is stored in UTC and edited in the admin's local time.
const toLocalInput = (iso: string | null) => {
  if (!iso) return '';
  const date = new Date(iso), pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
};
const fromLocalInput = (value: string) => { const time = new Date(value); return value && Number.isFinite(time.getTime()) ? time.toISOString() : null; };
const showTime = (iso: string) => new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
const planFields = ['free_trial', 'pro', 'pro_max'] as const;
const editablePlanFields = ['pro', 'pro_max'] as const;
const apiOrigin = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5002' : '');
const deployment = process.env.NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT;
const environment = ['Production', 'Staging', 'Development'].includes(deployment || '') ? deployment : 'Unknown';
const controlClass = 'h-10 w-full min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50';
const quickClass = 'w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors text-left flex items-center justify-between border border-slate-700 disabled:opacity-50';

function verifiedSnapshot(body: Snapshot & { success?: boolean }): Snapshot {
  if (body.success !== true || !body.settings || typeof body.version !== 'string'
    || typeof body.settings.maintenanceMode !== 'boolean' || typeof body.settings.allowNewRegistrations !== 'boolean'
    || ![body.settings.maintenanceStartsAt, body.settings.maintenanceEndsAt].every(value => value == null || typeof value === 'string')
    || !body.settings.planRequestLimits || !planFields.every(plan => { const limit = body.settings.planRequestLimits[plan];
      return Number.isSafeInteger(limit) && (limit as number) > 0 || plan !== 'pro' && limit === null; })
    || !['stored', 'defaults'].includes(body.source) || !Array.isArray(body.warnings)) throw new Error('Invalid settings response');
  // Older responses have no schedule fields: treat them as "not scheduled".
  return { ...body, settings: { ...body.settings, maintenanceStartsAt: body.settings.maintenanceStartsAt ?? null,
    maintenanceEndsAt: body.settings.maintenanceEndsAt ?? null } };
}

export default function SettingsPage() {
  const { user } = useAdminAuth();
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [draft, setDraft] = useState<Configuration>(initial);
  const [phase, setPhase] = useState<Phase>('loading');
  const [saving, setSaving] = useState(false);
  const [information, setInformation] = useState<Information | null>(null);
  const [message, setMessage] = useState('');
  const [health, setHealth] = useState('Not checked');
  const [checkingHealth, setCheckingHealth] = useState(false);
  const [confirmMaintenance, setConfirmMaintenance] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const ready = phase === 'ready' || phase === 'missing';
  const dirty = !!snapshot && (editableFields.some(field => draft[field] !== snapshot.settings[field])
    || editablePlanFields.some(plan => draft.planRequestLimits[plan] !== snapshot.settings.planRequestLimits[plan]));
  const changePlan = (plan: typeof editablePlanFields[number], limit: number | null) => setDraft(current => ({ ...current, planRequestLimits: { ...current.planRequestLimits, [plan]: limit } }));

  const request = useCallback(async (path: string, method = 'GET', body?: unknown, timeoutMs = 15000) => {
    if (!user) throw Object.assign(new Error('Admin session required'), { status: 401 });
    const token = await user.getIdToken();
    const response = await fetch(`/api/v1/admin/system/${path}`, { method, cache: 'no-store',
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      ...(body ? { body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(timeoutMs) });
    const payload = await response.json();
    if (!response.ok) throw Object.assign(new Error(payload.error || 'System settings unavailable'), { status: response.status });
    return payload;
  }, [user]);

  const load = useCallback(async () => {
    const current = ++generation.current;
    setPhase('loading'); setSaving(false); setMessage('');
    const [configuration, info] = await Promise.allSettled([request('settings'), request('information')]);
    if (current !== generation.current) return;
    if (info.status === 'fulfilled' && info.value.success === true) setInformation(info.value);
    else setInformation(null);
    try {
      if (configuration.status === 'rejected') throw configuration.reason;
      const loaded = verifiedSnapshot(configuration.value);
      setSnapshot(loaded); setDraft(loaded.settings); setPhase(loaded.source === 'defaults' ? 'missing' : 'ready');
    } catch (error) {
      setSnapshot(null);
      const status = (error as { status?: number }).status;
      setPhase(status === 401 || status === 403 ? 'unauthorized' : 'unavailable');
      setMessage(status === 401 || status === 403 ? 'An active Admin session is required to manage settings.'
        : 'Settings could not be loaded. Refresh Settings before editing.');
    }
  }, [request]);
  useEffect(() => {
    let active = true;
    const requestCounter = generation;
    void Promise.resolve().then(() => { if (active) return load(); });
    return () => { active = false; requestCounter.current++; };
  }, [load]);
  useEffect(() => { if (confirmMaintenance) dialog.current?.showModal(); else dialog.current?.close(); }, [confirmMaintenance]);

  const save = async () => {
    setConfirmMaintenance(false);
    if (!snapshot || !ready || !dirty || saving) return;
    setSaving(true); setMessage('');
    const current = generation.current;
    try {
      const changes: Record<string, unknown> = Object.fromEntries(editableFields.filter(field => draft[field] !== snapshot.settings[field]).map(field => [field, draft[field]]));
      const changedPlans = editablePlanFields.filter(plan => draft.planRequestLimits[plan] !== snapshot.settings.planRequestLimits[plan]);
      if (changedPlans.length) changes.planRequestLimits = Object.fromEntries(changedPlans.map(plan => [plan, draft.planRequestLimits[plan]]));
      const payload = await request('settings', 'PATCH', { version: snapshot.version, changes });
      if (current !== generation.current) return;
      if (payload.success !== true || payload.saved !== true) throw new Error('Save outcome unverified');
      if (payload.reloadRequired) {
        setSnapshot(null); setPhase('unavailable'); setMessage('Settings were saved, but the reload is unavailable. Refresh Settings before editing again.');
      } else {
        const loaded = verifiedSnapshot(payload);
        setSnapshot(loaded); setDraft(loaded.settings); setPhase('ready'); setMessage('Settings saved and reloaded successfully.');
      }
    } catch (error) {
      if (current !== generation.current) return;
      const status = (error as { status?: number }).status;
      if (status === 409) { setPhase('conflict'); setMessage('Another Admin changed settings. Refresh Settings and review your changes.'); }
      else if (status === 400) setMessage('Check your values. Each finite plan allowance must be a positive whole number. Pro requires a finite daily allowance.');
      else {
        setPhase(status === 401 || status === 403 ? 'unauthorized' : 'unavailable');
        setMessage(status === 401 || status === 403 ? 'Admin authorization is unavailable. Settings were not accepted.'
          : 'The save outcome could not be verified. Refresh Settings before trying again.');
      }
    } finally { if (current === generation.current) setSaving(false); }
  };
  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!ready || !dirty || saving) return;
    if (draft.maintenanceMode && !snapshot?.settings.maintenanceMode) setConfirmMaintenance(true);
    else void save();
  };
  const checkHealth = async () => {
    setCheckingHealth(true);
    try {
      if (!apiOrigin) { setHealth('API endpoint not configured'); return; }
      const response = await fetch(`${apiOrigin}/daas/v1/health`, { cache: 'no-store', signal: AbortSignal.timeout(15000) });
      const body = await response.json();
      setHealth(response.ok && body.status === 'operational' ? `Available — HTTP ${response.status}; checked ${new Date().toLocaleTimeString()}` : `Unavailable — HTTP ${response.status}`);
    } catch { setHealth('Unavailable — health request failed'); }
    finally { setCheckingHealth(false); }
  };

  return <div className="w-full px-6 max-sm:px-0 lg:px-8 space-y-8 pb-10">
    <div>
      <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-3"><Settings className="w-8 h-8 text-indigo-500" />System Settings</h1>
      <p className="text-slate-400">Manage platform availability, registrations, and plan request allowances.</p>
    </div>
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <form onSubmit={handleSave} className="glass-card rounded-xl border border-white/5 overflow-hidden">
          <div className="p-6 border-b border-slate-800"><h2 className="text-lg font-bold text-white flex items-center gap-2"><Server className="w-5 h-5 text-indigo-400" />General Configuration</h2></div>
          <div className="p-6 space-y-6">
            {phase === 'loading' && <p role="status" className="text-slate-400">Loading authoritative settings…</p>}
            {phase === 'missing' && <p role="status" className="text-amber-300">No settings document exists. The displayed defaults are effective; your first change will initialize settings.</p>}
            {snapshot?.warnings.map(warning => <p key={warning} role="status" className="text-amber-300">{warning}</p>)}
            <fieldset disabled={!ready || saving} className="space-y-6 disabled:opacity-60">
              <div className="flex items-center justify-between gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <div><h3 className="text-sm font-bold text-white">Maintenance Mode</h3><p className="text-xs text-slate-400 mt-1">Turns maintenance on now. Customers are signed out and can&apos;t sign in until it&apos;s off. The customer API (/daas) keeps working, and Admins can still sign in.</p></div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input aria-label="Maintenance Mode" type="checkbox" className="sr-only peer" checked={draft.maintenanceMode} onChange={e => setDraft({ ...draft, maintenanceMode: e.target.checked })} />
                  <span className="w-11 h-6 bg-slate-700 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>
              <div className="space-y-3 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <div><h3 className="text-sm font-bold text-white">Schedule Maintenance</h3>
                  <p className="text-xs text-slate-400 mt-1">Maintenance starts and ends on its own at these times (your local time). Customers get an email and a notification when you save a schedule.</p></div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="space-y-1 text-xs text-slate-300">Starts
                    <input type="datetime-local" aria-label="Maintenance starts" value={toLocalInput(draft.maintenanceStartsAt)}
                      onChange={e => setDraft({ ...draft, maintenanceStartsAt: fromLocalInput(e.target.value) })} className={controlClass} /></label>
                  <label className="space-y-1 text-xs text-slate-300">Ends
                    <input type="datetime-local" aria-label="Maintenance ends" value={toLocalInput(draft.maintenanceEndsAt)}
                      onChange={e => setDraft({ ...draft, maintenanceEndsAt: fromLocalInput(e.target.value) })} className={controlClass} /></label>
                </div>
                {draft.maintenanceStartsAt && draft.maintenanceEndsAt && Date.parse(draft.maintenanceEndsAt) <= Date.parse(draft.maintenanceStartsAt)
                  && <p role="alert" className="text-xs text-rose-300">The end must be after the start.</p>}
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs text-slate-400">{snapshot?.settings.maintenanceStartsAt && snapshot.settings.maintenanceEndsAt
                    ? Date.now() >= Date.parse(snapshot.settings.maintenanceEndsAt) ? `Last maintenance ended ${showTime(snapshot.settings.maintenanceEndsAt)}.`
                      : Date.now() >= Date.parse(snapshot.settings.maintenanceStartsAt) ? `In maintenance now, until ${showTime(snapshot.settings.maintenanceEndsAt)}.`
                      : `Scheduled: ${showTime(snapshot.settings.maintenanceStartsAt)} – ${showTime(snapshot.settings.maintenanceEndsAt)}.`
                    : 'No maintenance scheduled.'}</p>
                  {(draft.maintenanceStartsAt || draft.maintenanceEndsAt) && <button type="button" onClick={() => setDraft({ ...draft, maintenanceStartsAt: null, maintenanceEndsAt: null })}
                    className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Clear schedule / end now</button>}
                </div>
              </div>
              <div className="flex items-center justify-between gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <div><h3 className="text-sm font-bold text-white">Allow New Registrations</h3><p className="text-xs text-slate-400 mt-1">Control creation of new Customer profiles. Existing customers can still sign in.</p></div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input aria-label="Allow New Registrations" type="checkbox" className="sr-only peer" checked={draft.allowNewRegistrations} onChange={e => setDraft({ ...draft, allowNewRegistrations: e.target.checked })} />
                  <span className="w-11 h-6 bg-slate-700 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>
              <div className="p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <h3 className="text-sm font-bold text-white flex items-center gap-2 mb-2"><Shield className="w-4 h-4 text-indigo-400" />Plan Limits</h3>
                <p className="mb-4 text-xs leading-5 text-slate-400">Active Pro and Pro Max subscriptions use a fixed 15,000 API requests per month (Pro Max: per segment). The daily Pro and Pro Max values below only apply to older daily contracts.</p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <label htmlFor="free-trial-linked-products" className="block text-sm font-medium leading-5 text-slate-300">Free Trial</label>
                    <input id="free-trial-linked-products" aria-label="Free Trial linked products" type="text" value={TRIAL_MAX_PRODUCTS} readOnly className={controlClass} />
                    <p className="text-xs leading-4 text-slate-400">Linked products</p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor="pro-request-limit" className="block text-sm font-medium leading-5 text-slate-300">Pro</label>
                    <input id="pro-request-limit" aria-label="Pro daily request allowance" type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} required
                      value={draft.planRequestLimits.pro} onChange={event => changePlan('pro', Number(event.target.value))} className={controlClass} />
                    <p className="text-xs leading-4 text-slate-400">Requests/day</p>
                  </div>
                  <div className="space-y-2">
                    <label htmlFor={draft.planRequestLimits.pro_max === null ? 'pro-max-request-mode' : 'pro_max-request-limit'} className="block text-sm font-medium leading-5 text-slate-300">Pro Max</label>
                    {draft.planRequestLimits.pro_max === null ? <select id="pro-max-request-mode" aria-label="Pro Max request mode" value="unlimited"
                      onChange={() => changePlan('pro_max', 500)} className={controlClass}>
                      <option value="unlimited">Unlimited</option><option value="finite">Set request limit</option>
                    </select> : <div className="flex h-10 gap-2">
                      <input id="pro_max-request-limit" aria-label="Pro Max daily request allowance" type="number" min={1} max={Number.MAX_SAFE_INTEGER} step={1} required
                        value={draft.planRequestLimits.pro_max} onChange={event => changePlan('pro_max', Number(event.target.value))} className={controlClass} />
                      <button type="button" aria-label="Set Pro Max to Unlimited" onClick={() => changePlan('pro_max', null)} className="h-10 shrink-0 rounded-lg border border-slate-700 px-3 text-sm text-slate-200 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400">∞</button>
                    </div>}
                    <p className="text-xs leading-4 text-slate-400">Requests/day</p>
                  </div>
                </div>
                <p className="text-xs text-slate-400 mt-3">{snapshot?.planLimitPeriod || 'Finite allowances are shared across all active API keys and reset at midnight UTC.'}</p>
                <p className="text-xs text-slate-400 mt-2">Increases apply immediately. Lower allowances apply to new contracts; existing paid promises and existing Unlimited Trials remain protected. Saving never resets request usage.</p>
                <p className="text-xs text-slate-400 mt-2">The Trial remains seven days with {TRIAL_MAX_PRODUCTS} products and up to {TRIAL_MAX_ACTIVE_KEYS} active keys. Prices and independent abuse protection remain unchanged.</p>
              </div>
            </fieldset>
          </div>
          <div className="p-4 border-t border-slate-800 bg-slate-900/30 flex flex-wrap gap-3 items-center justify-between">
            <div className="text-sm text-slate-300"><p role="status">{message}</p>{dirty && <p className="text-amber-300">Unsaved changes</p>}</div>
            <button type="submit" disabled={!ready || saving || !dirty} className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save Settings'}</button>
          </div>
        </form>
      </div>
      <div className="space-y-6">
        <div className="glass-card rounded-xl border border-white/5 p-6">
          <h2 className="text-lg font-bold text-white mb-4 flex items-center gap-2"><Server className="w-5 h-5 text-indigo-400" />System Information</h2>
          <dl className="space-y-4 text-sm">
            <div className="flex justify-between gap-4 py-2 border-b border-slate-800"><dt className="text-slate-400">API Version</dt><dd className="font-semibold text-white">{information?.apiVersion ? `v${information.apiVersion}` : 'Unavailable'}</dd></div>
            <div className="flex justify-between gap-4 py-2 border-b border-slate-800"><dt className="text-slate-400">Database connection</dt><dd className="font-semibold text-white">{information?.databaseStatus || (apiOrigin ? 'Unavailable' : 'Not configured')}</dd></div>
            <div className="flex justify-between gap-4 py-2 border-b border-slate-800"><dt className="text-slate-400">Environment</dt><dd className="font-semibold text-amber-400">{environment}</dd></div>
            <div className="flex justify-between gap-4 py-2"><dt className="text-slate-400">Uptime</dt><dd className="text-slate-400">Not tracked</dd></div>
          </dl>
          <p className="text-xs text-slate-500 mt-3">{information ? `Database checked ${new Date(information.checkedAt).toLocaleString()}. This is a single probe.` : 'Database connectivity has not been verified.'}</p>
        </div>
        <div className="glass-card rounded-xl border border-white/5 p-6">
          <h2 className="text-lg font-bold text-white mb-4">Quick Actions</h2>
          <div className="space-y-3">
            <Link href="/audit" className={quickClass}><span>View Audit Logs</span><span aria-hidden="true">→</span></Link>
            <button type="button" disabled={saving || phase === 'loading'} onClick={() => { void load(); }} className={quickClass}><span>Refresh Settings</span><span aria-hidden="true">→</span></button>
            <button type="button" disabled={checkingHealth} onClick={() => { void checkHealth(); }} className={quickClass}><span>{checkingHealth ? 'Checking…' : 'Check API Health'}</span><span aria-hidden="true">→</span></button>
          </div>
          <p role="status" className="text-xs text-slate-400 mt-3">{health}</p>
        </div>
        <BackupRestoreCard request={request} />
      </div>
    </div>
    <dialog ref={dialog} aria-labelledby="maintenance-confirm-title" onCancel={() => setConfirmMaintenance(false)} className="bg-slate-900 text-white rounded-xl border border-slate-700 p-6 max-w-md backdrop:bg-black/60">
      <h2 id="maintenance-confirm-title" className="text-xl font-bold">Enable maintenance mode?</h2>
      <p className="text-slate-300 mt-3">Customer business operations will pause. Admin recovery, existing sign-in and payment completion remain available.</p>
      <div className="flex justify-end gap-3 mt-6"><button type="button" autoFocus onClick={() => setConfirmMaintenance(false)} className="rounded-lg px-4 py-2 bg-slate-800">Cancel</button><button type="button" disabled={saving} onClick={() => { void save(); }} className="rounded-lg px-4 py-2 bg-indigo-600">Enable and Save</button></div>
    </dialog>
  </div>;
}
