// Keep this file identical in dashboard/ and admin-panel/.
import { useEffect, useState } from "react";
import type { User } from "@/lib/supabase-auth";
import type { CategoryUsage, ReportSelection } from "@/lib/reports";

export type CategoryUsageState = { status: "loading" | "ready" | "error"; segments: Partial<Record<ReportSelection, CategoryUsage[]>> };
const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
const validRow = (row: unknown): row is CategoryUsage => !!row && typeof (row as CategoryUsage).name === "string"
  && Number.isSafeInteger((row as CategoryUsage).users) && Number.isSafeInteger((row as CategoryUsage).products);

// One read per signed-in user; the API refreshes its aggregate at most once a minute.
export function useCategoryUsage(user: User | null) {
  const [state, setState] = useState<CategoryUsageState>({ status: "loading", segments: {} });
  useEffect(() => {
    if (!user) return;
    const controller = new AbortController();
    (async () => {
      const token = await user.getIdToken();
      const response = await fetch(API_BASE.replace(/\/$/u, "") + "/api/v1/reports/category-usage",
        { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: controller.signal });
      const payload = await response.json() as { success?: boolean; segments?: Record<string, unknown> };
      if (!response.ok || payload.success !== true || !payload.segments) throw new Error("Category usage unavailable");
      const segments = Object.fromEntries(Object.entries(payload.segments)
        .filter(([, rows]) => Array.isArray(rows) && rows.every(validRow))) as CategoryUsageState["segments"];
      if (!controller.signal.aborted) setState({ status: "ready", segments });
    })().catch(() => { if (!controller.signal.aborted) setState({ status: "error", segments: {} }); });
    return () => controller.abort();
  }, [user]);
  return state;
}
