"use client";

import { ShieldAlert } from "lucide-react";

export default function Page() {
  return (
    <div className="space-y-8 pb-10">
      <div>
        <h1 className="text-3xl font-bold tracking-tight text-white mb-2 flex items-center gap-2">
          <ShieldAlert className="w-8 h-8 text-red-500" />
          Feature Coming Soon
        </h1>
        <p className="text-slate-400">This admin feature is currently under development.</p>
      </div>
      <div className="glass-card rounded-xl p-8 border border-white/5 text-center">
        <p className="text-slate-300">We are working on bringing this functionality to the Super Admin Control Panel.</p>
      </div>
    </div>
  );
}
