"use client";

import { ShieldAlert } from "lucide-react";

interface ErrorStateProps {
  error: string;
}

export default function ErrorState({ error }: ErrorStateProps) {
  return (
    <div className="p-12 text-center">
      <div className="w-16 h-16 rounded-full bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center mx-auto mb-4">
        <ShieldAlert className="w-8 h-8 text-indigo-400" />
      </div>
      <h3 className="text-xl font-semibold text-white mb-2">Failed to Load Products</h3>
      <p className="text-slate-400 mb-4 max-w-md mx-auto">{error}</p>
      <div className="flex gap-3 justify-center">
        <button
          onClick={() => window.location.reload()}
          className="px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-sm font-medium text-white transition-colors"
        >
          Retry
        </button>
        <a
          href="/"
          className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-sm font-medium text-slate-300 transition-colors"
        >
          Back to Dashboard
        </a>
      </div>
      <div className="mt-6 p-4 rounded-lg bg-slate-900/50 border border-slate-800 max-w-md mx-auto">
        <p className="text-xs text-slate-500 text-left">
          <strong className="text-slate-400">Troubleshooting:</strong><br />
          • Ensure backend API is running on port 5000<br />
          • Check if Firebase credentials are configured<br />
          • Verify NEXT_PUBLIC_API_URL in .env.local
        </p>
      </div>
    </div>
  );
}
