"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

// Settings has two tabs: account settings and privacy (data and account deletion).
const tabs = [{ name: "General", href: "/dashboard/settings" }, { name: "Privacy", href: "/dashboard/privacy" }];

export default function SettingsTabs() {
  const pathname = usePathname();
  return <nav aria-label="Settings sections" className="mb-6 flex gap-2 border-b border-slate-800">
    {tabs.map(tab => {
      const active = pathname === tab.href;
      return <Link key={tab.href} href={tab.href} aria-current={active ? "page" : undefined}
        className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition-colors ${active ? "border-indigo-500 text-indigo-400" : "border-transparent text-slate-400 hover:text-slate-200"}`}>
        {tab.name}
      </Link>;
    })}
  </nav>;
}
