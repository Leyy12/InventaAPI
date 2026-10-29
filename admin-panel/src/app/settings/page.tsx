"use client";

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Settings, Save, Server } from 'lucide-react';
import { useAdminAuth } from '@/lib/supabase/admin-auth-context';
import BackupRestoreCard from '@/components/admin/BackupRestoreCard';

type Configuration = { maintenanceMode: boolean; allowNewRegistrations: boolean;
  maintenanceStartsAt: string | null; maintenanceEndsAt: string | null };
type Snapshot = { settings: Configuration; version: string; source: 'stored' | 'defaults'; warnings: string[] };
type Information = { apiVersion: string | null; databaseStatus: 'Connected' | 'Unavailable' | 'Not configured'; checkedAt: string; uptime: string };
type Phase = 'loading' | 'ready' | 'missing' | 'unauthorized' | 'unavailable' | 'conflict';
const initial: Configuration = { maintenanceMode: false, allowNewRegistrations: true,
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
// Maintenance is on, or a saved window has not ended yet (upcoming or running).
const maintenanceWindowOpen = (settings: Configuration) => settings.maintenanceMode
  || (!!settings.maintenanceEndsAt && Date.now() < Date.parse(settings.maintenanceEndsAt));
const apiOrigin = process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === 'development' ? 'http://localhost:5002' : '');
const deployment = process.env.NEXT_PUBLIC_DEPLOYMENT_ENVIRONMENT;
const environment = ['Production', 'Staging', 'Development'].includes(deployment || '') ? deployment : 'Unknown';
const controlClass = 'h-10 w-full min-w-0 bg-slate-950 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-indigo-500 disabled:opacity-50';
const quickClass = 'w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors text-left flex items-center justify-between border border-slate-700 disabled:opacity-50';

function verifiedSnapshot(body: Snapshot & { success?: boolean }): Snapshot {
  if (body.success !== true || !body.settings || typeof body.version !== 'string'
    || typeof body.settings.maintenanceMode !== 'boolean' || typeof body.settings.allowNewRegistrations !== 'boolean'
    || ![body.settings.maintenanceStartsAt, body.settings.maintenanceEndsAt].every(value => value == null || typeof value === 'string')
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
  // The Maintenance Mode switch opens the schedule. Maintenance itself starts and ends on its own at the saved times.
  const [scheduling, setScheduling] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);
  const generation = useRef(0);
  const ready = phase === 'ready' || phase === 'missing';
  const dirty = !!snapshot && editableFields.some(field => draft[field] !== snapshot.settings[field]);
  const { maintenanceStartsAt: startsAt, maintenanceEndsAt: endsAt } = draft;
  const endBeforeStart = !!startsAt && !!endsAt && Date.parse(endsAt) <= Date.parse(startsAt);
  const endInPast = !!endsAt && Date.parse(endsAt) <= Date.now();
  const scheduleIncomplete = scheduling && !draft.maintenanceMode && !(startsAt && endsAt);
  const scheduleChanged = !!snapshot && (startsAt !== snapshot.settings.maintenanceStartsAt || endsAt !== snapshot.settings.maintenanceEndsAt);
  const canSave = ready && dirty && !saving && !scheduleIncomplete && !endBeforeStart && !(scheduleChanged && endInPast);
  const setSchedule = (changes: Partial<Configuration>) =>
    // Editing the times hands control to the schedule (this also replaces an older "on now" switch).
    setDraft(current => ({ ...current, maintenanceMode: false, ...changes }));
  const toggleMaintenance = (on: boolean) => {
    setScheduling(on);
    if (!snapshot) return;
    setDraft(current => on
      // Start from empty times when the saved window already ended.
      ? (current.maintenanceEndsAt && Date.parse(current.maintenanceEndsAt) <= Date.now() ? { ...current, maintenanceStartsAt: null, maintenanceEndsAt: null } : current)
      // Off cancels an upcoming or running maintenance; otherwise it just discards unsaved times.
      : maintenanceWindowOpen(snapshot.settings) ? { ...current, maintenanceMode: false, maintenanceStartsAt: null, maintenanceEndsAt: null }
        : { ...current, maintenanceMode: false, maintenanceStartsAt: snapshot.settings.maintenanceStartsAt, maintenanceEndsAt: snapshot.settings.maintenanceEndsAt });
  };
  const startNow = () => { const now = new Date(); now.setSeconds(0, 0); setSchedule({ maintenanceStartsAt: now.toISOString() }); };

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
      setSnapshot(loaded); setDraft(loaded.settings); setScheduling(maintenanceWindowOpen(loaded.settings)); setPhase(loaded.source === 'defaults' ? 'missing' : 'ready');
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
    if (!snapshot || !canSave) return;
    setSaving(true); setMessage('');
    const current = generation.current;
    try {
      const changes = Object.fromEntries(editableFields.filter(field => draft[field] !== snapshot.settings[field]).map(field => [field, draft[field]]));
      const payload = await request('settings', 'PATCH', { version: snapshot.version, changes });
      if (current !== generation.current) return;
      if (payload.success !== true || payload.saved !== true) throw new Error('Save outcome unverified');
      if (payload.reloadRequired) {
        setSnapshot(null); setPhase('unavailable'); setMessage('Settings were saved, but the reload is unavailable. Refresh Settings before editing again.');
      } else {
        const loaded = verifiedSnapshot(payload);
        setSnapshot(loaded); setDraft(loaded.settings); setScheduling(maintenanceWindowOpen(loaded.settings)); setPhase('ready'); setMessage('Settings saved and reloaded successfully.');
      }
    } catch (error) {
      if (current !== generation.current) return;
      const status = (error as { status?: number }).status;
      if (status === 409) { setPhase('conflict'); setMessage('Another Admin changed settings. Refresh Settings and review your changes.'); }
      else if (status === 400) setMessage('Check your values. A maintenance schedule needs both times, with the end after the start.');
      else {
        setPhase(status === 401 || status === 403 ? 'unauthorized' : 'unavailable');
        setMessage(status === 401 || status === 403 ? 'Admin authorization is unavailable. Settings were not accepted.'
          : 'The save outcome could not be verified. Refresh Settings before trying again.');
      }
    } finally { if (current === generation.current) setSaving(false); }
  };
  const handleSave = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave) return;
    // A new schedule emails every customer, so confirm it first.
    if (scheduleChanged && startsAt && endsAt) setConfirmMaintenance(true);
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
      <p className="text-slate-400">Manage platform availability and registrations.</p>
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
              <div className="space-y-4 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <div className="flex items-center justify-between gap-4">
                  <div><h3 className="text-sm font-bold text-white">Maintenance Mode</h3><p className="text-xs text-slate-400 mt-1">Turn on to schedule maintenance. It starts and ends automatically at the times you set. During maintenance customers are signed out and can&apos;t sign in; the customer API (/daas) keeps working and Admins can still sign in. Turn off to cancel or end it.</p></div>
                  <label className="relative inline-flex items-center cursor-pointer shrink-0">
                    <input aria-label="Maintenance Mode" type="checkbox" className="sr-only peer" checked={scheduling} onChange={e => toggleMaintenance(e.target.checked)} />
                    <span className="w-11 h-6 bg-slate-700 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                  </label>
                </div>
                {scheduling && <div className="space-y-3 border-t border-slate-800 pt-4">
                  <div><h3 className="text-sm font-bold text-white">Schedule Maintenance</h3>
                    <p className="text-xs text-slate-400 mt-1">Set when maintenance starts and ends (your local time). Customers get an email and a notification when you save.</p></div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <label className="space-y-1 text-xs text-slate-300">Starts
                      <input type="datetime-local" aria-label="Maintenance starts" value={toLocalInput(startsAt)}
                        onChange={e => setSchedule({ maintenanceStartsAt: fromLocalInput(e.target.value) })} className={controlClass} /></label>
                    <label className="space-y-1 text-xs text-slate-300">Ends
                      <input type="datetime-local" aria-label="Maintenance ends" value={toLocalInput(endsAt)}
                        onChange={e => setSchedule({ maintenanceEndsAt: fromLocalInput(e.target.value) })} className={controlClass} /></label>
                  </div>
                  {endBeforeStart && <p role="alert" className="text-xs text-rose-300">The end must be after the start.</p>}
                  {!endBeforeStart && scheduleChanged && endInPast && <p role="alert" className="text-xs text-rose-300">The end time has already passed.</p>}
                  {scheduleIncomplete && <p className="text-xs text-amber-300">Set a start and an end time, then Save Settings.</p>}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">{snapshot?.settings?.maintenanceMode ? 'Maintenance is on now, with no end time. Set times to schedule its end, or turn the switch off to end it.'
                      : snapshot?.settings?.maintenanceStartsAt && snapshot?.settings.maintenanceEndsAt && Date.now() < Date.parse(snapshot?.settings.maintenanceEndsAt)
                      ? Date.now() >= Date.parse(snapshot?.settings.maintenanceStartsAt) ? `In maintenance now, until ${showTime(snapshot?.settings.maintenanceEndsAt)}.`
                        : `Scheduled: ${showTime(snapshot?.settings.maintenanceStartsAt)} – ${showTime(snapshot?.settings.maintenanceEndsAt)}.`
                      : 'No maintenance scheduled.'}</p>
                    <button type="button" onClick={startNow} className="rounded-lg border border-slate-700 px-3 py-1.5 text-xs text-slate-200 hover:bg-slate-800">Start now</button>
                  </div>
                </div>}
              </div>
              <div className="flex items-center justify-between gap-4 p-4 bg-slate-900/50 rounded-lg border border-slate-800">
                <div><h3 className="text-sm font-bold text-white">Allow New Registrations</h3><p className="text-xs text-slate-400 mt-1">Control creation of new Customer profiles. Existing customers can still sign in.</p></div>
                <label className="relative inline-flex items-center cursor-pointer shrink-0">
                  <input aria-label="Allow New Registrations" type="checkbox" className="sr-only peer" checked={draft.allowNewRegistrations} onChange={e => setDraft({ ...draft, allowNewRegistrations: e.target.checked })} />
                  <span className="w-11 h-6 bg-slate-700 rounded-full peer-focus-visible:ring-2 peer-focus-visible:ring-indigo-400 peer-checked:bg-indigo-500 after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:after:translate-x-full" />
                </label>
              </div>
            </fieldset>
          </div>
          <div className="p-4 border-t border-slate-800 bg-slate-900/30 flex flex-wrap gap-3 items-center justify-between">
            <div className="text-sm text-slate-300"><p role="status">{message}</p>{dirty && <p className="text-amber-300">Unsaved changes</p>}</div>
            <button type="submit" disabled={!canSave} className="px-6 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors flex items-center justify-center gap-2 disabled:opacity-50"><Save className="w-4 h-4" />{saving ? 'Saving…' : 'Save Settings'}</button>
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
    <dialog ref={dialog} aria-labelledby="maintenance-confirm-title" onCancel={() => setConfirmMaintenance(false)} className="m-auto bg-slate-900 text-white rounded-xl border border-slate-700 p-6 max-w-md backdrop:bg-black/60">
      <h2 id="maintenance-confirm-title" className="text-xl font-bold">Schedule maintenance?</h2>
      {startsAt && endsAt && <p className="text-slate-300 mt-3">{Date.parse(startsAt) <= Date.now()
        ? `Maintenance starts right away and ends automatically on ${showTime(endsAt)}. Customers are signed out now.`
        : `Maintenance starts automatically on ${showTime(startsAt)} and ends on ${showTime(endsAt)}.`} Every customer gets an email and a notification.</p>}
      <div className="flex justify-end gap-3 mt-6"><button type="button" autoFocus onClick={() => setConfirmMaintenance(false)} className="rounded-lg px-4 py-2 bg-slate-800">Cancel</button><button type="button" disabled={saving} onClick={() => { void save(); }} className="rounded-lg px-4 py-2 bg-indigo-600">Schedule and Save</button></div>
    </dialog>
  </div>;
}
