"use client";

import { X, PackageSearch, ArrowUpRight, ShieldCheck } from "lucide-react";

interface ProductNotFoundProps {
  searchQuery: string;
  onClearSearch?: () => void;
}

export default function ProductNotFound({ searchQuery, onClearSearch }: ProductNotFoundProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-4">
      <div className="w-full max-w-lg animate-in fade-in zoom-in-95 duration-300">

        {/* 404 Badge */}
        <div className="flex justify-center mb-5">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">404</span>
            <span className="text-xs text-slate-600">•</span>
            <span className="text-xs font-medium text-slate-400">Not Found</span>
          </div>
        </div>

        {/* Icon */}
        <div className="flex justify-center mb-5">
          <div className="w-16 h-16 rounded-2xl bg-slate-800 border border-slate-700 flex items-center justify-center">
            <PackageSearch className="w-8 h-8 text-slate-400" />
          </div>
        </div>

        {/* Title & Description */}
        <div className="text-center mb-6">
          <h2 className="text-2xl font-bold text-white mb-2">Product Not Found</h2>
          <p className="text-sm text-slate-400 leading-relaxed">
            We could not find any products matching{" "}
            <span className="text-indigo-400 font-semibold">"{searchQuery}"</span> in our catalog.
          </p>
        </div>

        {/* Clear Search */}
        {onClearSearch && (
          <div className="flex justify-center mb-8">
            <button
              onClick={onClearSearch}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors border border-slate-700 hover:border-slate-600"
            >
              <X className="w-4 h-4" />
              Clear Search
            </button>
          </div>
        )}

        {/* Divider */}
        <div className="flex items-center gap-3 mb-6">
          <div className="flex-1 h-px bg-slate-800" />
          <span className="text-xs text-slate-500 uppercase tracking-wider">Can&apos;t find it?</span>
          <div className="flex-1 h-px bg-slate-800" />
        </div>

        {/* Add Product Tip */}
        <div className="glass-card rounded-xl p-5 border border-slate-700/60">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-lg bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center shrink-0 mt-0.5">
              <ArrowUpRight className="w-4 h-4 text-indigo-400" />
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-sm font-semibold text-white mb-1">Want to add this product?</h3>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                Click the <span className="text-indigo-400 font-semibold">+ Add Product</span> button at the top-right corner. Our admin team reviews every submission before it appears in the catalog.
              </p>
              <div className="flex items-start gap-2 p-2.5 rounded-lg bg-amber-500/[0.07] border border-amber-500/15 text-xs text-amber-300/80">
                <ShieldCheck className="w-3.5 h-3.5 text-amber-400/80 shrink-0 mt-0.5" />
                <p>
                  <span className="font-medium text-amber-300">Strict verification applies.</span>{" "}
                  Fabricated or misleading details will be rejected and may result in account suspension.
                </p>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
