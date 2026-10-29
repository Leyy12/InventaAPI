import { MAINTENANCE_APOLOGY } from '../../../services/system-settings-contract.mjs';

export type MaintenanceStatus = { active: boolean; startsAt: string | null; endsAt: string | null };

// Reads whether maintenance is in effect now (switched on or inside the scheduled window).
export async function readMaintenanceStatus(signal?: AbortSignal): Promise<MaintenanceStatus | null> {
  try {
    const response = await fetch('/api/v1/system/status', { cache: 'no-store', signal });
    const body = await response.json();
    if (!response.ok || body.success !== true || typeof body.maintenanceMode !== 'boolean') return null;
    return { active: body.maintenanceMode, startsAt: body.maintenanceStartsAt ?? null, endsAt: body.maintenanceEndsAt ?? null };
  } catch { return null; }
}

export function maintenanceNotice(status: Pick<MaintenanceStatus, 'endsAt'> | null): string {
  const end = status?.endsAt ? new Date(status.endsAt) : null;
  const until = end && Number.isFinite(end.getTime()) && end.getTime() > Date.now()
    ? ` Expected back: ${end.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}.` : '';
  return MAINTENANCE_APOLOGY + until;
}
