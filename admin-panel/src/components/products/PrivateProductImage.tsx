"use client";

import { useEffect, useState } from 'react';
import { useAdminAuth } from '@/lib/firebase/admin-auth-context';

export default function PrivateProductImage({ assetId }: { assetId: string }) {
  const { user } = useAdminAuth();
  const [source, setSource] = useState('');
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    async function load() {
      try {
        if (!user) throw new Error('Sign in as Admin to view this attachment.');
        const token = await user.getIdToken();
        const base = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:5002';
        const response = await fetch(base + '/api/v1/product-media/' + encodeURIComponent(assetId) + '/private', {
          headers: { Authorization: `Bearer ${token}` }, cache: 'no-store', signal: controller.signal,
        });
        if (!response.ok || response.headers.get('content-type') !== 'image/webp') throw new Error('Private photo unavailable. Retry before making a review decision.');
        const blob = await response.blob();
        if (blob.size > 2 * 1024 * 1024) throw new Error('Invalid image response.');
        if (controller.signal.aborted) return;
        objectUrl = URL.createObjectURL(blob); setSource(objectUrl); setError('');
      } catch (cause) { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : 'Unable to load photo.'); }
    }
    void load();
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [assetId, user, retry]);
  return <div className="space-y-2">
    <div className="flex h-40 w-40 items-center justify-center rounded-xl border border-slate-700 bg-slate-800">
      {/* Private authenticated response is rendered from a short-lived local object URL. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {source && !error ? <img src={source} alt="Private submitted product photo" className="h-full w-full object-contain p-3" /> : <span className="text-xs text-slate-400">{error ? 'Photo unavailable' : 'Loading photo…'}</span>}
    </div>
    <p className="text-xs text-slate-400">Private attachment — published only after approval.</p>
    {error && <><p role="alert" className="text-xs text-rose-300">{error}</p><button type="button" onClick={() => setRetry(value => value + 1)} className="text-xs text-indigo-300">Retry image preview</button></>}
  </div>;
}
