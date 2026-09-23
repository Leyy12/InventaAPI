"use client";

import { useEffect, useMemo, useState } from "react";
import { collection, documentId, getDocs, query, where } from "firebase/firestore";
import { db } from "@/lib/firebase/config";
import { canonicalLinkedProductIds, linkedProductLabels, type ProductLink } from "@/lib/linked-product-names";

export function useLinkedProductNames(keys: ProductLink[]) {
  const ids = useMemo(() => [...new Set(keys.flatMap(canonicalLinkedProductIds))], [keys]);
  const signature = ids.join("\u0000");
  const [result, setResult] = useState<{ signature: string; names: Record<string, string>; failed: boolean }>({
    signature: "", names: {}, failed: false,
  });

  useEffect(() => {
    let current = true;
    async function load() {
      const found: Record<string, string> = Object.create(null);
      try {
        // Only persisted linked document IDs are read. Firestore 'in' queries are bounded.
        for (let i = 0; i < ids.length; i += 30) {
          const batch = ids.slice(i, i + 30);
          const result = await getDocs(query(collection(db, "products"), where(documentId(), "in", batch)));
          for (const product of result.docs) {
            const name = product.data().name;
            if (typeof name === "string" && name.trim()) found[product.id] = name.trim();
          }
        }
        if (current) setResult({ signature, names: found, failed: false });
      } catch {
        if (current) setResult({ signature, names: {}, failed: true });
      }
    }
    void load();
    return () => { current = false; };
    // signature captures the canonical ID set, not transient names or browser-supplied labels.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);
  return { names: result.signature === signature ? result.names : {},
    ready: result.signature === signature, failed: result.signature === signature && result.failed };
}

export function LinkedProducts({ link, names, ready, failed }: { link: ProductLink; names: Record<string, string>; ready: boolean; failed: boolean }) {
  const ids = canonicalLinkedProductIds(link);
  if (!ids.length) return <span className="text-sm text-slate-500">No linked products</span>;
  if (!ready) return <span className="text-sm text-slate-500">Loading linked products…</span>;
  if (failed) return <span className="text-sm text-amber-400">Linked product names unavailable</span>;
  const labels = linkedProductLabels(ids, names);
  return <div className="max-w-52 text-sm text-slate-300" title={labels.join(" • ")}>
    <ul className="space-y-0.5">{labels.slice(0, 3).map((label, index) =>
      <li key={ids[index]} className="truncate">{label}</li>)}</ul>
    {labels.length > 3 && <span className="text-xs text-slate-500">+{labels.length - 3} more linked products</span>}
  </div>;
}
