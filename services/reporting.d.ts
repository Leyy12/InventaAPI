export type ReportSegment = 'Grocery' | 'Pharmacy' | 'Hardware';
export type ReportSelection = ReportSegment | 'All';
export const REPORT_SEGMENTS: readonly ReportSegment[];
export function reportSelection(value: unknown): ReportSelection | null;
export function customerReportScope(plan: unknown, preference: unknown): { state: string; segment: ReportSelection | null; restricted: boolean };
export interface ReportSession { uid: string | null; selection: ReportSelection; loadCatalog: boolean; scope: ReturnType<typeof customerReportScope> }
export function reconcileReportSession(previous: ReportSession | null, uid: string | null, plan: unknown, preference: unknown): ReportSession;
export function quotaVerificationKey(uid: string | null, entitlement: Record<string, unknown> | null): string | null;
export function activeKeyHolders(keys: ReportSource, accounts: ReportSource): number | null;
export interface CatalogReport {
  total: number; priced: number; missingPrice: number; averagePrice: number | null;
  distribution: { range: string; count: number }[];
  segments: { name: string; count: number }[];
  categories: { name: string; count: number }[];
}
export type ReportSource = { status: 'loading' | 'error' | 'ready'; records: Record<string, unknown>[] };
export function catalogReport(records: unknown[], selection?: ReportSelection): CatalogReport;
export function reportView(source: ReportSource, selection: ReportSelection): { state: 'loading' | 'error' | 'empty' | 'ready'; report: CatalogReport | null };
export function quotaSummary(usage: unknown, now?: Date): { used: number | null; limit: number | null; remaining: number | null; percent: number | null; pending: boolean; resetsAt: string } | null;
export function reportTimestamp(value: unknown): Date | null;
export function telemetryReport(records: Record<string, unknown>[]): { recorded: number; excluded: number; successPercent: number | null; outcomeSamples: number; averageLatency: number | null; latencySamples: number; series: { hour: string; count: number }[] };
