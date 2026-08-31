"use client";

import { X } from "lucide-react";

interface ProductNotFoundProps {
  searchQuery: string;
  onClearSearch?: () => void;
}

export default function ProductNotFound({ searchQuery, onClearSearch }: ProductNotFoundProps) {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-xl animate-in fade-in zoom-in-95 duration-300">
        {/* Background Gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        </div>

        {/* Main Card */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/95 border border-slate-700/50 rounded-2xl shadow-2xl backdrop-blur-xl p-8 text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800 border border-slate-700 mb-6">
            <span className="text-xs font-bold text-slate-300 uppercase tracking-wide">404</span>
            <span className="text-xs text-slate-500">•</span>
            <span className="text-xs font-medium text-slate-400">Not Found</span>
          </div>

          <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight mb-4">
            Product Not Found
          </h2>

          <p className="text-base text-slate-400 leading-relaxed mb-8">
            We couldn't find any products matching <span className="text-indigo-400 font-semibold">"{searchQuery}"</span>.
          </p>

          {onClearSearch && (
            <button
              onClick={onClearSearch}
              className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors border border-slate-700 hover:border-slate-600"
            >
              <X className="w-4 h-4" />
              Clear Search
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
