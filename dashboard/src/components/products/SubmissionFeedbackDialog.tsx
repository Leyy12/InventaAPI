"use client";

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { AlertTriangle, Check, Clock3, X } from 'lucide-react';

export type SubmissionFeedback = {
  kind: 'success' | 'error' | 'uncertain';
  message: string;
  reference?: string;
};

export function trapSubmissionFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  const items = [...dialog.querySelectorAll<HTMLElement>('button, input, select, textarea, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.matches(':disabled') && element.getClientRects().length > 0);
  const target = event.shiftKey ? items.at(-1) : items[0];
  if (!items.length || !dialog.contains(document.activeElement)
    || document.activeElement === (event.shiftKey ? items[0] : items.at(-1))) {
    event.preventDefault(); (target || dialog).focus();
  }
}

export default function SubmissionFeedbackDialog({ feedback, onDismiss }: {
  feedback: SubmissionFeedback; onDismiss: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const doneRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal();
    doneRef.current?.focus();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 160, easing: 'ease-out' });
    }
    return () => {
      dialog.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
    };
  }, []);

  const success = feedback.kind === 'success';
  const uncertain = feedback.kind === 'uncertain';
  const Icon = success ? Check : uncertain ? Clock3 : AlertTriangle;
  return <dialog ref={dialogRef} aria-labelledby="submission-feedback-title" aria-describedby="submission-feedback-description"
    onKeyDown={trapSubmissionFocus}
    onCancel={event => { event.preventDefault(); onDismiss(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto rounded-2xl border border-slate-700/80 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm">
    <div className="p-6 sm:p-7">
      <div className="flex items-start justify-between gap-4">
        <div className={'flex h-12 w-12 items-center justify-center rounded-2xl border ' + (success ? 'border-emerald-400/25 bg-emerald-500/10 text-emerald-300' : 'border-amber-400/25 bg-amber-500/10 text-amber-300')}>
          <Icon className="h-6 w-6" aria-hidden="true" />
        </div>
        <button type="button" aria-label="Close submission feedback" onClick={onDismiss} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <h2 id="submission-feedback-title" className="mt-5 text-xl font-semibold tracking-tight text-white">
        {success ? 'Product Submitted for Review' : uncertain ? 'Submission Not Yet Confirmed' : 'Unable to Submit Product'}
      </h2>
      <p id="submission-feedback-description" className="mt-3 text-sm leading-6 text-slate-400">{feedback.message}</p>
      {feedback.reference && <div className="mt-5 rounded-xl border border-slate-700/70 bg-slate-950/40 p-3">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">Submission reference</p>
        <p className="mt-1 break-all font-mono text-xs leading-5 text-slate-200">{feedback.reference}</p>
      </div>}
      {!success && <p className="mt-4 text-xs leading-5 text-slate-500">Your form details and selected image are preserved. Return to the form to retry the same request.</p>}
    </div>
    <div className="border-t border-slate-800 bg-slate-950/20 px-6 py-5 sm:px-7">
      <button ref={doneRef} type="button" onClick={onDismiss} className={'min-h-11 w-full rounded-xl px-5 py-2.5 text-sm font-semibold text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ' + (success ? 'bg-emerald-600 hover:bg-emerald-500' : 'bg-indigo-500 hover:bg-indigo-400')}>
        {success ? 'Done' : 'Back to Form'}
      </button>
    </div>
  </dialog>;
}
