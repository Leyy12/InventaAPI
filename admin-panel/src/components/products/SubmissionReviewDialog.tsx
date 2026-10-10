"use client";

import { useEffect, useRef, type KeyboardEvent } from 'react';
import { Check, Loader2, X } from 'lucide-react';
import { useAdminAuth } from '@/lib/firebase/admin-auth-context';
import ProductImagePreview from './ProductImagePreview';
import PrivateProductImage from './PrivateProductImage';

export type Submission = {
  id: string; userId: string; status: string; createdAt: string; productId: string | null;
  content?: { name: string; brand: string; segment: string; category: string; description: string;
    image_url: string; image_asset_id?: string; sku: string; variants: Record<string, string | number>[] };
};
export type Decision = { id: string; action: 'approve' | 'reject' };
export const reviewButtonClass = 'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl px-4 py-2 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:cursor-wait disabled:opacity-50';

function trapReviewFocus(event: KeyboardEvent<HTMLDialogElement>) {
  if (event.key !== 'Tab') return;
  const dialog = event.currentTarget;
  const items = [...dialog.querySelectorAll<HTMLElement>('button, a[href], [tabindex]:not([tabindex="-1"])')]
    .filter(element => !element.matches(':disabled') && element.getClientRects().length > 0);
  const target = event.shiftKey ? items.at(-1) : items[0];
  if (!items.length || !dialog.contains(document.activeElement)
    || document.activeElement === (event.shiftKey ? items[0] : items.at(-1))) {
    event.preventDefault(); (target || dialog).focus();
  }
}

export function submittedDate(value: string) {
  const date = new Date(value);
  return typeof value === 'string' && Number.isFinite(date.getTime())
    ? date.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Legacy timestamp';
}

export function ReviewStatus({ status }: { status: string }) {
  const label = status === 'submitted' ? 'Awaiting review' : status === 'approved' ? 'Approved' : status === 'rejected' ? 'Rejected' : status;
  return <span className={'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ' + (status === 'approved' ? 'border-emerald-400/20 bg-emerald-400/10 text-emerald-300' : status === 'rejected' ? 'border-rose-400/20 bg-rose-400/10 text-rose-300' : 'border-amber-400/20 bg-amber-400/10 text-amber-200')}>
    <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden="true" />{label}
  </span>;
}

export function SubmissionImage({ row, size }: { row: Submission; size: 'thumbnail' | 'review' }) {
  const { user } = useAdminAuth();
  return row.content?.image_asset_id
    ? <PrivateProductImage key={row.content.image_asset_id + ':' + user?.uid} assetId={row.content.image_asset_id} size={size} name={row.content.name} />
    : <ProductImagePreview url={row.content?.image_url} name={row.content?.name || 'Submitted product'} size={size} />;
}

function Detail({ label, value }: { label: string; value?: string | number | null }) {
  return <div className="min-w-0"><dt className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm leading-5 text-slate-200">{value === '' || value == null ? '—' : value}</dd></div>;
}

export default function SubmissionReviewDialog({ row, busy, decision, locked, error, onClose, onReview, onRefresh }: {
  row: Submission; busy: boolean; decision: Decision | null; locked: boolean; error: string;
  onClose: () => void; onReview: (id: string, action: 'approve' | 'reject') => void; onRefresh: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    dialog.showModal(); closeRef.current?.focus();
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      dialog.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'translateY(0)' }], { duration: 160, easing: 'ease-out' });
    }
    return () => {
      dialog.close(); document.body.style.overflow = overflow;
      if (previousFocus?.isConnected) previousFocus.focus();
      else document.querySelector<HTMLSelectElement>('[aria-label="Review status"]')?.focus();
    };
  }, []);
  const content = row.content;
  const actionable = row.status === 'submitted' && !!content && !locked;
  return <dialog ref={dialogRef} aria-labelledby="submission-review-title" aria-describedby="submission-review-description" aria-busy={busy}
    onKeyDown={trapReviewFocus}
    onCancel={event => { event.preventDefault(); if (!decision) onClose(); }}
    className="fixed inset-0 m-auto w-[calc(100%-2rem)] max-w-4xl max-h-[calc(100dvh-2rem)] overflow-hidden rounded-2xl border border-slate-700/80 bg-slate-900 p-0 text-slate-200 shadow-2xl backdrop:bg-slate-950/80 backdrop:backdrop-blur-sm">
    <div className="flex max-h-[calc(100dvh-2rem)] flex-col">
      <div className="flex shrink-0 items-start justify-between gap-4 border-b border-slate-800 px-5 py-4 sm:px-6">
        <div className="min-w-0"><p className="text-[10px] font-semibold uppercase tracking-wider text-indigo-300">Product review</p>
          <h2 id="submission-review-title" className="mt-1 break-words text-lg font-semibold text-white">{content?.name || 'Legacy submission'}</h2>
          <p id="submission-review-description" className="mt-1 text-xs leading-5 text-slate-400">Review the submitted details before making a final decision.</p></div>
        <button ref={closeRef} type="button" aria-label="Close review" disabled={!!decision} onClick={onClose} className="shrink-0 rounded-lg p-2 text-slate-400 hover:bg-slate-800 focus-visible:ring-2 focus-visible:ring-indigo-400 disabled:opacity-40"><X className="h-4 w-4" aria-hidden="true" /></button>
      </div>
      <div className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
        <div className="grid gap-6 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
          <div className="space-y-3"><SubmissionImage row={row} size="review" /><ReviewStatus status={row.status} /></div>
          <div className="min-w-0 space-y-5">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-4 rounded-xl border border-slate-800 bg-slate-950/25 p-4">
              <Detail label="Brand" value={content?.brand} /><Detail label="Segment" value={content?.segment} />
              <Detail label="Category" value={content?.category} /><Detail label="Submitted" value={submittedDate(row.createdAt)} />
              <div className="col-span-2"><Detail label="Submission reference" value={row.id} /></div>
              <div className="col-span-2"><Detail label="Customer UID" value={row.userId} /></div>
              <div className="col-span-2"><Detail label="Product SKU" value={content?.sku} /></div>
              {row.productId && <div className="col-span-2"><Detail label="Published product" value={row.productId} /></div>}
            </dl>
            <div><h3 className="text-xs font-semibold text-slate-300">Description</h3><p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6 text-slate-400">{content?.description || 'No description provided.'}</p></div>
            {!content && <p className="text-sm text-amber-200">This legacy submission requires separate operator resolution.</p>}
          </div>
        </div>
        {content && <section className="mt-6" aria-label="Submitted variants">
          <h3 className="mb-3 text-sm font-semibold text-slate-200">Variants <span className="ml-1 text-xs font-normal text-slate-500">{content.variants.length}</span></h3>
          <div className="grid gap-3 sm:grid-cols-2">{content.variants.map((variant, index) => <div key={index} className="rounded-xl border border-slate-800 bg-slate-950/25 p-4">
            <p className="mb-3 text-[10px] font-semibold uppercase tracking-wider text-slate-500">Variant {index + 1}</p>
            <dl className="grid grid-cols-2 gap-3">{Object.entries(variant).map(([key, value]) => <Detail key={key} label={key} value={value} />)}</dl>
          </div>)}</div>
          {content.variants.length === 0 && <p className="text-sm text-slate-500">No variants submitted.</p>}
        </section>}
        {error && <p role="alert" className="mt-5 rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 text-sm leading-5 text-rose-200">{error}</p>}
        {locked && <p className="mt-3 text-xs leading-5 text-amber-200">The decision is not confirmed. Refresh the authoritative status before taking another action.</p>}
      </div>
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2 border-t border-slate-800 bg-slate-950/25 px-5 py-4 sm:px-6">
        <p className="mr-auto w-full text-xs leading-5 text-slate-500 sm:w-auto">{row.status === 'submitted' ? 'Only approval publishes. Decisions are final.' : 'This decision is final.'}</p>
        {decision && <p role="status" className="mr-auto text-xs text-indigo-300">{decision.action === 'approve' ? 'Publishing product…' : 'Rejecting submission…'}</p>}
        {locked && <button type="button" disabled={busy} onClick={onRefresh} className={reviewButtonClass + ' border border-slate-700 text-slate-200'}>Refresh status</button>}
        <button type="button" disabled={!!decision} onClick={onClose} className={reviewButtonClass + ' border border-slate-700 text-slate-300'}>Close</button>
        {actionable && <>
          <button type="button" disabled={busy} onClick={() => onReview(row.id, 'reject')} className={reviewButtonClass + ' border border-rose-400/25 bg-rose-400/5 text-rose-300 hover:bg-rose-400/10'}>
            {decision?.action === 'reject' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <X className="h-4 w-4" aria-hidden="true" />}Reject
          </button>
          <button type="button" disabled={busy} onClick={() => onReview(row.id, 'approve')} className={reviewButtonClass + ' bg-emerald-600 text-white hover:bg-emerald-500'}>
            {decision?.action === 'approve' ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Check className="h-4 w-4" aria-hidden="true" />}Approve and Publish
          </button>
        </>}
      </div>
    </div>
  </dialog>;
}
