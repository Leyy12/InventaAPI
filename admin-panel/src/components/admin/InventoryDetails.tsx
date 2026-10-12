import { formatKeyTimestamp, inventoryPlanLabel, inventoryUsage, type EntitlementLoadStatus } from '@/lib/api-key-inventory';
import type { AccountEntitlement } from '@/lib/use-account-entitlements';

function Skeleton({ label }: { label: string }) {
  return <span role="status" aria-label={label} className="block space-y-2 motion-safe:animate-pulse">
    <span aria-hidden="true" className="block h-3 w-24 rounded bg-slate-700/70" />
    <span aria-hidden="true" className="block h-4 w-36 rounded bg-slate-700/50" />
  </span>;
}

export function InventoryPlanBadge({ account, state }: { account?: AccountEntitlement; state: EntitlementLoadStatus }) {
  if (state === 'loading') return <Skeleton label="Loading account plan" />;
  return <span aria-busy={state === 'refreshing'} className="text-xs px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-300 border border-indigo-500/20 font-medium">
    {inventoryPlanLabel(state === 'unavailable' ? undefined : account)}
  </span>;
}

export function InventoryPlanUsage({ account, products, state }: { account?: AccountEntitlement; products: number; state: EntitlementLoadStatus }) {
  if (state === 'loading') return <Skeleton label="Loading plan usage" />;
  const usage = inventoryUsage(state === 'unavailable' ? undefined : account, products);
  const warning = usage.percent !== undefined && usage.percent >= 80;
  return <div className="min-w-48 space-y-1.5" aria-busy={state === 'refreshing'}>
    <p className="text-xs text-slate-400">{usage.label}</p>
    <p className={`text-sm font-semibold tabular-nums ${warning ? 'text-amber-300' : 'text-slate-100'}`}>{usage.value}</p>
    {usage.percent !== undefined && <div aria-hidden="true" className="h-1 w-full overflow-hidden rounded-full bg-slate-800">
      <div className={`h-full ${warning ? 'bg-amber-400' : 'bg-indigo-400'}`} style={{ width: `${usage.percent}%` }} />
    </div>}
    {usage.note && <p className="text-xs text-slate-400">{usage.note}</p>}
    <p className="text-[10px] text-slate-500">Account-level allowance</p>
    {state === 'refreshing' && <p role="status" className="text-[10px] text-indigo-300">Refreshing · last verified values</p>}
  </div>;
}

export function InventoryTimeline({ createdAt, lastUsed }: { createdAt?: unknown; lastUsed?: unknown }) {
  return <div className="space-y-2 text-xs">
    <div><p className="text-slate-500">Created</p><p className="mt-0.5 text-slate-300">{formatKeyTimestamp(createdAt, 'createdAt')}</p></div>
    <div><p className="text-slate-500">Last Used</p><p className="mt-0.5 text-slate-300">{formatKeyTimestamp(lastUsed, 'lastUsed')}</p></div>
  </div>;
}
