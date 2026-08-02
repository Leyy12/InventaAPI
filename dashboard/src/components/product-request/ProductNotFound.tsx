"use client";

import { ArrowRight } from "lucide-react";

interface ProductNotFoundProps {
  searchQuery: string;
  onRequestProduct: () => void;
}

export default function ProductNotFound({ searchQuery, onRequestProduct }: ProductNotFoundProps) {
  return (
    <div className="min-h-[calc(100vh-12rem)] flex items-center justify-center px-4 py-8">
      <div className="w-full max-w-5xl animate-in fade-in zoom-in-95 duration-300">
        {/* Background Gradients */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none -z-10">
          <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-indigo-500/5 rounded-full blur-3xl" />
          <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-blue-500/5 rounded-full blur-3xl" />
        </div>

        {/* Main Card - Compact 2-Column Layout */}
        <div className="relative overflow-hidden bg-gradient-to-br from-slate-900/95 via-slate-900/90 to-slate-800/95 border border-slate-700/50 rounded-2xl shadow-2xl backdrop-blur-xl">
          {/* Subtle Glow */}
          <div className="absolute top-0 right-0 w-[500px] h-[300px] bg-gradient-to-br from-indigo-500/5 to-purple-500/5 blur-3xl" />
          
          <div className="relative p-8">
            {/* Two Column Layout */}
            <div className="grid md:grid-cols-[1.2fr,1fr] gap-8 items-start">
              {/* Left Column - Product Info */}
              <div className="space-y-5">
                {/* Compact Status Badge + Title */}
                <div className="space-y-3">
                  {/* Compact Badge Only */}
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-red-500/10 border border-red-500/20">
                    <span className="text-xs font-bold text-red-400 uppercase tracking-wide">404</span>
                    <span className="text-xs text-slate-400">•</span>
                    <span className="text-xs font-medium text-slate-400">Not Found</span>
                  </div>

                  {/* Title */}
                  <h2 className="text-2xl md:text-3xl font-bold text-white leading-tight">
                    Product Not Found
                  </h2>

                  {/* Description */}
                  <p className="text-base text-slate-400 leading-relaxed">
                    Product <span className="text-indigo-400 font-semibold">"{searchQuery}"</span> doesn't exist in our database yet.
                  </p>
                </div>

                {/* Quick Info Chips - Text Only */}
                <div className="flex flex-wrap gap-2">
                  <div className="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <span className="text-xs text-slate-300">24–48 hrs</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <span className="text-xs text-slate-300">You'll be notified</span>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-slate-800/50 border border-slate-700/50">
                    <span className="text-xs text-slate-300">Auto-added</span>
                  </div>
                </div>

                {/* CTA Button - Premium Design */}
                <button
                  onClick={onRequestProduct}
                  className="group relative w-full overflow-hidden bg-gradient-to-r from-indigo-600 via-indigo-500 to-blue-500 hover:from-indigo-500 hover:via-indigo-400 hover:to-blue-400 text-white font-semibold py-3.5 px-6 rounded-xl transition-all duration-300 shadow-xl shadow-indigo-500/25 hover:shadow-2xl hover:shadow-indigo-500/40 hover:scale-[1.02] active:scale-[0.98]"
                >
                  {/* Shimmer effect */}
                  <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-200%] group-hover:translate-x-[200%] transition-transform duration-700" />
                  
                  {/* Button content */}
                  <span className="relative flex items-center justify-center gap-2.5">
                    <span className="text-base">Request Product</span>
                    <ArrowRight className="w-4.5 h-4.5 group-hover:translate-x-1 transition-transform" />
                  </span>

                  {/* Glow effect on hover */}
                  <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-indigo-400/0 via-indigo-400/10 to-indigo-400/0" />
                </button>
              </div>

              {/* Right Column - Recommendation Card */}
              <div className="relative">
                {/* Glass Card */}
                <div className="relative overflow-hidden bg-gradient-to-br from-indigo-500/10 to-blue-500/10 border border-indigo-500/20 rounded-xl p-5 backdrop-blur-sm">
                  {/* Subtle gradient overlay */}
                  <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 rounded-full blur-2xl" />
                  
                  <div className="relative space-y-4">
                    {/* Header - Text Only */}
                    <div>
                      <h3 className="text-sm font-bold text-indigo-300 mb-1">
                        Smart Recommendation
                      </h3>
                      <p className="text-xs text-slate-400 leading-relaxed">
                        Help us expand the catalog. Submit this product and we'll add it after verification.
                      </p>
                    </div>

                    {/* Compact Benefits List */}
                    <div className="space-y-2">
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <div className="w-1 h-1 rounded-full bg-emerald-400" />
                        <span>Review time: <span className="font-semibold text-white">24–48 hours</span></span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <div className="w-1 h-1 rounded-full bg-emerald-400" />
                        <span>Available in API after approval</span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-300">
                        <div className="w-1 h-1 rounded-full bg-emerald-400" />
                        <span>Notification sent when ready</span>
                      </div>
                    </div>

                    {/* Timeline indicator */}
                    <div className="pt-3 border-t border-indigo-500/10">
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <div className="flex-1 h-1 bg-slate-800 rounded-full overflow-hidden">
                          <div className="h-full w-[15%] bg-gradient-to-r from-indigo-500 to-blue-500 rounded-full" />
                        </div>
                        <span className="font-medium">Step 1 of 3</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Helper text */}
                <p className="text-xs text-slate-500 text-center mt-3">
                  Collaborative, self-expanding catalog
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Bottom Info - Text Only */}
        <div className="grid md:grid-cols-2 gap-3 mt-4">
          <div className="bg-slate-900/30 border border-slate-800/50 rounded-lg p-3 hover:border-slate-700/50 transition-colors">
            <h4 className="text-xs font-semibold text-slate-300 mb-1">What happens next?</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Our team reviews and verifies product details before adding to catalog.
            </p>
          </div>

          <div className="bg-slate-900/30 border border-slate-800/50 rounded-lg p-3 hover:border-slate-700/50 transition-colors">
            <h4 className="text-xs font-semibold text-slate-300 mb-1">Track your request</h4>
            <p className="text-xs text-slate-500 leading-relaxed">
              Monitor status in your dashboard and receive email updates.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
