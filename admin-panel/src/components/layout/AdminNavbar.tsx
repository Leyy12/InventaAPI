import { Bell, Terminal, ShieldAlert } from "lucide-react";

export default function AdminNavbar() {
  return (
    <header className="h-16 glass border-b border-slate-800/60 px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-4 flex-1">
        <div className="flex items-center gap-2 text-indigo-400 text-sm font-medium">
          <ShieldAlert className="w-4 h-4" />
          <span>Super Admin Control Panel</span>
        </div>
      </div>

      <div className="flex items-center gap-4">
        <button className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-800/50 border border-slate-700/50 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-600 transition-colors">
          <Terminal className="w-3.5 h-3.5" />
          API Status: <span className="text-emerald-400 flex items-center gap-1.5"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span> Operational</span>
        </button>

        <button className="relative p-2 rounded-full text-slate-400 hover:text-slate-200 hover:bg-slate-800/50 transition-colors">
          <Bell className="w-5 h-5" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-indigo-500 border-2 border-slate-950"></span>
        </button>
      </div>
    </header>
  );
}
