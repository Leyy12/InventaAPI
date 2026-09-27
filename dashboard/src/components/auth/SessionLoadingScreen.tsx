"use client";

import { useEffect, useState, type ReactNode } from "react";
import Image from "next/image";

type SessionLoadingScreenProps = { variant: "public" | "workspace" };

const surface = "min-h-screen w-full bg-slate-950/95 text-slate-50";

export default function SessionLoadingScreen({ variant }: SessionLoadingScreenProps) {
  const [showWorkspaceDetails, setShowWorkspaceDetails] = useState(false);

  useEffect(() => {
    if (variant !== "workspace") return;
    const timer = window.setTimeout(() => setShowWorkspaceDetails(true), 240);
    return () => window.clearTimeout(timer);
  }, [variant]);

  if (variant === "public") {
    return (
      <div className={`${surface} flex items-center justify-center px-5`}>
        <div className="w-full max-w-sm rounded-3xl border border-indigo-400/15 bg-slate-900/70 px-8 py-9 text-center shadow-xl shadow-indigo-950/20">
          <Image src="/inventa-logo.png" alt="InventaAPI" width={64} height={64} priority className="mx-auto mb-5 object-contain" />
          <p role="status" className="text-base font-medium tracking-wide text-slate-100">Preparing InventaAPI…</p>
          <span aria-hidden="true" className="mx-auto mt-5 block h-1.5 w-1.5 rounded-full bg-indigo-400 animate-pulse motion-reduce:animate-none" />
        </div>
      </div>
    );
  }

  return (
    <div className={`${surface} flex overflow-hidden`}>
      <aside aria-hidden="true" className="hidden w-64 shrink-0 flex-col border-r border-slate-800/70 bg-slate-900/40 md:flex">
        <div className="flex h-16 items-center gap-2 border-b border-slate-800/70 px-6 text-lg font-bold text-indigo-300">
          <Image src="/inventa-logo.png" alt="" width={48} height={48} priority className="object-contain" />
          InventaAPI
        </div>
        <div className="space-y-5 px-6 py-9">
          <div className="h-2.5 w-28 rounded-full bg-slate-700/60" />
          <div className="h-3 w-36 rounded-full bg-slate-700/45" />
          <div className="h-3 w-32 rounded-full bg-slate-700/45" />
          <div className="h-3 w-40 rounded-full bg-slate-700/45" />
        </div>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <div aria-hidden="true" className="flex h-16 shrink-0 items-center justify-between border-b border-slate-800/70 bg-slate-900/30 px-4 sm:px-8">
          <div className="flex items-center gap-2 md:hidden">
            <Image src="/inventa-logo.png" alt="" width={42} height={42} priority className="object-contain" />
            <span className="font-semibold text-indigo-200">InventaAPI</span>
          </div>
          <div className="hidden h-3 w-36 rounded-full bg-slate-700/50 md:block" />
          <div className="h-8 w-8 rounded-full bg-slate-700/40" />
        </div>
        <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-8 sm:px-8 sm:py-10" aria-busy="true">
          {showWorkspaceDetails && (
            <>
              <div className="mb-8 rounded-2xl border border-indigo-400/15 bg-slate-900/60 px-5 py-6 sm:px-7">
                <div className="flex items-center gap-3" role="status">
                  <span aria-hidden="true" className="h-2 w-2 shrink-0 rounded-full bg-indigo-400 animate-pulse motion-reduce:animate-none" />
                  <p className="text-base font-semibold text-slate-100 sm:text-lg">Preparing your workspace…</p>
                </div>
                <p className="mt-2 pl-5 text-sm text-slate-400">Your dashboard will appear when it is ready.</p>
              </div>
              <div aria-hidden="true" className="space-y-6">
                <div className="h-6 w-44 rounded-full bg-slate-700/55" />
                <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  <div className="h-36 rounded-2xl border border-slate-800 bg-slate-900/55 p-5"><div className="h-3 w-24 rounded-full bg-slate-700/60" /><div className="mt-7 h-7 w-32 rounded-full bg-slate-700/45" /></div>
                  <div className="h-36 rounded-2xl border border-slate-800 bg-slate-900/55 p-5"><div className="h-3 w-28 rounded-full bg-slate-700/60" /><div className="mt-7 h-7 w-24 rounded-full bg-slate-700/45" /></div>
                  <div className="h-36 rounded-2xl border border-slate-800 bg-slate-900/55 p-5"><div className="h-3 w-20 rounded-full bg-slate-700/60" /><div className="mt-7 h-7 w-28 rounded-full bg-slate-700/45" /></div>
                </div>
                <div className="h-40 rounded-2xl border border-slate-800 bg-slate-900/55 p-5"><div className="h-3 w-36 rounded-full bg-slate-700/60" /><div className="mt-6 h-3 w-full max-w-xl rounded-full bg-slate-700/40" /><div className="mt-4 h-3 w-2/3 max-w-md rounded-full bg-slate-700/40" /></div>
              </div>
            </>
          )}
        </main>
      </div>
    </div>
  );
}

export function SessionRecoveryState({ onRetry, onReturnToLogin, busy, notice }: {
  onRetry: () => void;
  onReturnToLogin: () => void;
  busy: boolean;
  notice?: ReactNode;
}) {
  return (
    <div className={`${surface} flex items-center justify-center px-5`}>
      <section role="alert" className="w-full max-w-md rounded-3xl border border-indigo-400/20 bg-slate-900/80 px-7 py-8 text-center shadow-xl shadow-indigo-950/20">
        <Image src="/inventa-logo.png" alt="InventaAPI" width={56} height={56} className="mx-auto mb-5 object-contain" />
        <h1 className="text-xl font-semibold text-slate-50">We couldn&apos;t verify your session.</h1>
        <p className="mt-2 text-sm text-slate-300">We couldn&apos;t verify your account right now. Please try again.</p>
        <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <button type="button" onClick={onRetry} disabled={busy} className="rounded-xl bg-indigo-600 px-5 py-2.5 font-semibold text-white hover:bg-indigo-500 disabled:opacity-60">Try Again</button>
          <button type="button" onClick={onReturnToLogin} disabled={busy} className="rounded-xl border border-slate-600 px-5 py-2.5 font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-60">Return to Login</button>
        </div>
        {notice}
      </section>
    </div>
  );
}
