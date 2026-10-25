"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

import { THEME_STORAGE_KEY } from "@/lib/theme";

// Light/dark switch. The root layout applies a saved choice before the first paint.

export default function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<"dark" | "light" | null>(null);
  useEffect(() => {
    queueMicrotask(() => setTheme(document.documentElement.dataset.theme === "light" ? "light" : "dark"));
  }, []);
  const next = theme === "light" ? "dark" : "light";
  const label = `Switch to ${next} mode`;
  return <button type="button" aria-label={label} title={label} onClick={() => {
    if (next === "light") document.documentElement.dataset.theme = "light";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem(THEME_STORAGE_KEY, next); } catch { /* private mode: choice lasts this visit */ }
    setTheme(next);
  }} className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-slate-700/70 text-slate-300 transition-colors hover:bg-slate-800 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300 ${className}`}>
    {theme === "light" ? <Moon className="h-4 w-4" aria-hidden="true" /> : <Sun className="h-4 w-4" aria-hidden="true" />}
  </button>;
}
