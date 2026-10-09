"use client";

import { useEffect, useRef, useState } from 'react';
import { Loader2, LogOut, X } from 'lucide-react';

interface SignOutDialogProps {
  onClose: () => void;
  onSignOut: () => Promise<{ ok: boolean }>;
}

export default function SignOutDialog({ onClose, onSignOut }: SignOutDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const pending = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const dialog = dialogRef.current;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog?.showModal();
    cancelRef.current?.focus();
    return () => {
      dialog?.close();
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const confirmSignOut = async () => {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await onSignOut();
      if (result.ok) onClose();
      else setError("We couldn't sign you out. Please try again.");
    } catch {
      setError("We couldn't sign you out. Please try again.");
    } finally {
      pending.current = false;
      setBusy(false);
    }
  };

  return <dialog ref={dialogRef} aria-labelledby="sign-out-title" aria-describedby="sign-out-description"
    aria-modal="true" aria-busy={busy}
    onCancel={event => { event.preventDefault(); if (!pending.current) onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-700/80 bg-[#0d1526] p-0 text-slate-100 shadow-2xl backdrop:bg-slate-950/75 backdrop:backdrop-blur-sm">
    <div className="relative p-6 sm:p-7">
      <button type="button" aria-label="Close sign out dialog" disabled={busy} onClick={onClose}
        className="absolute right-4 top-4 flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-50">
        <X className="h-4 w-4" aria-hidden="true" />
      </button>
      <div className="mb-5 flex h-12 w-12 items-center justify-center rounded-2xl border border-indigo-400/20 bg-indigo-500/10 text-indigo-300">
        <LogOut className="h-6 w-6" aria-hidden="true" />
      </div>
      <h2 id="sign-out-title" className="pr-6 text-xl font-semibold tracking-tight text-white">Sign out of InventaAPI?</h2>
      <p id="sign-out-description" className="mt-3 text-sm leading-6 text-slate-400">You&apos;ll return to the home page. Sign in again whenever you&apos;re ready to access your workspace.</p>
      {error && <p role="alert" className="mt-4 rounded-lg border border-rose-400/20 bg-rose-400/5 px-3 py-2 text-sm text-rose-200">{error}</p>}
      {busy && <p role="status" className="sr-only">Signing you out…</p>}
    </div>
    <div className="flex flex-col-reverse gap-3 border-t border-slate-700/60 bg-slate-950/25 px-6 py-5 sm:flex-row sm:justify-end sm:px-7">
      <button ref={cancelRef} type="button" disabled={busy} onClick={onClose}
        className="min-h-11 rounded-xl border border-slate-600 px-5 py-2.5 text-sm font-semibold text-slate-200 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-50">Cancel</button>
      <button type="button" disabled={busy} onClick={() => { void confirmSignOut(); }}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-indigo-500 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 focus-visible:ring-offset-2 focus-visible:ring-offset-[#0d1526] disabled:cursor-wait disabled:opacity-70">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <LogOut className="h-4 w-4" aria-hidden="true" />}
        {busy ? 'Signing out…' : 'Sign out'}
      </button>
    </div>
  </dialog>;
}
