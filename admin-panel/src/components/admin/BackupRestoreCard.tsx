"use client";

import { useRef, useState } from 'react';
import { Download, Upload } from 'lucide-react';

type Request = (path: string, method?: string, body?: unknown, timeoutMs?: number) => Promise<any>;
type BackupFile = { format: string; version: number; createdAt: string; products: unknown[]; settings?: Record<string, unknown> };

const buttonClass = 'w-full px-4 py-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors text-left flex items-center justify-between border border-slate-700 disabled:opacity-50';

// Backup = products (with categories) + plan and registration settings.
// Customers, API keys, payments and usage are never included or changed.
export default function BackupRestoreCard({ request }: { request: Request }) {
  const [busy, setBusy] = useState<'' | 'backup' | 'restore'>('');
  const [status, setStatus] = useState('');
  const [pending, setPending] = useState<{ name: string; file: BackupFile } | null>(null);
  const [confirmDownload, setConfirmDownload] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const download = async () => {
    setConfirmDownload(false); setBusy('backup'); setStatus('');
    try {
      const { backup } = await request('backup', 'GET', undefined, 60000);
      const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `inventaapi-backup-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(link.href);
      setStatus(`Backup downloaded: ${backup.products.length} products and settings.`);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Backup failed.'); }
    finally { setBusy(''); }
  };

  const choose = async (file: File | undefined) => {
    if (input.current) input.current.value = '';
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as BackupFile;
      if (parsed?.format !== 'inventaapi-backup' || !Array.isArray(parsed.products)) throw new Error();
      setPending({ name: file.name, file: parsed }); setStatus('');
    } catch { setStatus('That file is not an InventaAPI backup.'); }
  };

  const restore = async () => {
    if (!pending) return;
    setBusy('restore');
    try {
      const result = await request('restore', 'POST', { backup: pending.file }, 120000);
      setStatus(`Restored ${result.restoredProducts} products${result.restoredSettings.length ? ' and settings' : ''}.`);
      setPending(null);
    } catch (error) { setStatus(error instanceof Error ? error.message : 'Restore failed.'); }
    finally { setBusy(''); }
  };

  return (
    <div className="glass-card rounded-xl border border-white/5 p-6">
      <h2 className="text-lg font-bold text-white mb-1">Backup &amp; Restore</h2>
      <p className="text-xs text-slate-400 mb-4">Products, categories and plan settings. Customers, API keys and payments are never included.</p>
      <div className="space-y-3">
        {confirmDownload ? (
          <div className="rounded-lg border border-slate-700 p-3 text-sm text-slate-300">
            <p>Download a backup file now?</p>
            <div className="flex gap-2 mt-3">
              <button type="button" onClick={() => setConfirmDownload(false)} className="rounded-lg px-3 py-1.5 bg-slate-800 text-xs">Cancel</button>
              <button type="button" onClick={() => { void download(); }} className="rounded-lg px-3 py-1.5 bg-indigo-600 text-xs text-white">Download</button>
            </div>
          </div>
        ) : (
          <button type="button" disabled={!!busy} onClick={() => setConfirmDownload(true)} className={buttonClass}>
            <span>{busy === 'backup' ? 'Preparing backup…' : 'Download Backup'}</span><Download className="w-4 h-4 text-indigo-400" />
          </button>
        )}
        <button type="button" disabled={!!busy} onClick={() => input.current?.click()} className={buttonClass}>
          <span>Restore from Backup</span><Upload className="w-4 h-4 text-amber-400" />
        </button>
        <input ref={input} type="file" accept="application/json,.json" className="hidden" onChange={event => { void choose(event.target.files?.[0]); }} />
        {pending && (
          <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm text-amber-100">
            <p className="font-medium">Restore {pending.file.products.length} products{pending.file.settings ? ' and plan settings' : ''}?</p>
            <p className="text-xs mt-1 text-amber-200/80">From {pending.name} (made {new Date(pending.file.createdAt).toLocaleString()}). Products in the file replace the current versions. Products added after the backup are kept.</p>
            <div className="flex gap-2 mt-3">
              <button type="button" disabled={busy === 'restore'} onClick={() => setPending(null)} className="rounded-lg px-3 py-1.5 bg-slate-800 text-xs text-slate-200">Cancel</button>
              <button type="button" disabled={busy === 'restore'} onClick={() => { void restore(); }} className="rounded-lg px-3 py-1.5 bg-amber-600 text-xs text-white">{busy === 'restore' ? 'Restoring…' : 'Restore'}</button>
            </div>
          </div>
        )}
      </div>
      <p role="status" className="text-xs text-slate-400 mt-3">{status}</p>
    </div>
  );
}
