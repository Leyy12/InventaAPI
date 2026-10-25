"use client";

import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Info, X } from "lucide-react";

// In-app replacement for the browser's alert()/confirm() pop-ups.
// Mount <AppDialogHost /> once (root layout); call appConfirm()/appAlert() anywhere.
type Tone = "danger" | "warning" | "info";
type Request = {
  kind: "confirm" | "alert";
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel: string;
  tone: Tone;
  resolve: (ok: boolean) => void;
};
type Options = { title: string; message: string; confirmLabel?: string; cancelLabel?: string; tone?: Tone };

let show: ((request: Request) => void) | null = null;
const queue: Request[] = [];

function open(kind: Request["kind"], options: Options): Promise<boolean> {
  return new Promise(resolve => {
    const request: Request = { kind, title: options.title, message: options.message, tone: options.tone ?? "info",
      confirmLabel: options.confirmLabel ?? (kind === "alert" ? "OK" : "Confirm"), cancelLabel: options.cancelLabel ?? "Cancel", resolve };
    if (show) show(request); else queue.push(request);
  });
}

export const appConfirm = (options: Options) => open("confirm", options);
export const appAlert = (options: Options) => open("alert", options).then(() => undefined);

const toneStyles: Record<Tone, { icon: string; button: string }> = {
  danger: { icon: "bg-red-500/15 text-red-400", button: "bg-red-600 hover:bg-red-500 focus-visible:ring-red-300" },
  warning: { icon: "bg-amber-500/15 text-amber-400", button: "bg-amber-600 hover:bg-amber-500 focus-visible:ring-amber-300" },
  info: { icon: "bg-indigo-500/15 text-indigo-400", button: "bg-indigo-600 hover:bg-indigo-500 focus-visible:ring-indigo-300" },
};

export default function AppDialogHost() {
  const [current, setCurrent] = useState<Request | null>(null);
  const pending = useRef<Request[]>([]);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = request => setCurrent(active => {
      if (active) { pending.current.push(request); return active; }
      return request;
    });
    const waiting = queue.splice(0);
    if (waiting.length) { pending.current.push(...waiting.slice(1)); queueMicrotask(() => setCurrent(waiting[0])); }
    return () => { show = null; };
  }, []);

  const close = (ok: boolean) => {
    if (!current) return;
    current.resolve(ok);
    setCurrent(pending.current.shift() ?? null);
  };

  useEffect(() => {
    if (!current) return;
    // Safer default focus: Cancel for destructive actions, the main button otherwise.
    (current.kind === "confirm" && current.tone === "danger" ? cancelRef : confirmRef).current?.focus();
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") { event.preventDefault(); close(false); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (!current) return null;
  const style = toneStyles[current.tone];
  const Icon = current.tone === "info" ? Info : AlertTriangle;

  return <div className="fixed inset-0 z-[200] flex items-center justify-center bg-slate-950/70 p-4 backdrop-blur-sm"
    onMouseDown={event => { if (event.target === event.currentTarget) close(false); }}>
    <div role={current.kind === "confirm" ? "alertdialog" : "dialog"} aria-modal="true" aria-labelledby="app-dialog-title" aria-describedby="app-dialog-message"
      className="w-full max-w-md rounded-2xl border border-slate-700/70 bg-slate-900 p-6 shadow-2xl animate-fadeIn">
      <div className="flex items-start gap-4">
        <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${style.icon}`}><Icon className="h-5 w-5" aria-hidden="true" /></div>
        <div className="min-w-0 flex-1">
          <h2 id="app-dialog-title" className="text-base font-semibold text-white">{current.title}</h2>
          <p id="app-dialog-message" className="mt-1.5 whitespace-pre-line break-words text-sm leading-6 text-slate-400">{current.message}</p>
        </div>
        <button type="button" aria-label="Close" onClick={() => close(false)}
          className="-mr-1 -mt-1 rounded-lg p-1.5 text-slate-500 transition-colors hover:bg-slate-800 hover:text-slate-200"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="mt-6 flex justify-end gap-3">
        {current.kind === "confirm" && <button ref={cancelRef} type="button" onClick={() => close(false)}
          className="rounded-lg border border-slate-700 px-4 py-2 text-sm font-medium text-slate-300 transition-colors hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400">{current.cancelLabel}</button>}
        <button ref={confirmRef} type="button" onClick={() => close(true)}
          className={`rounded-lg px-4 py-2 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 ${style.button}`}>{current.confirmLabel}</button>
      </div>
    </div>
  </div>;
}
