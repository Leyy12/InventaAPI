export type Segment = 'Grocery' | 'Pharmacy' | 'Hardware';
type Account = { plan?: unknown; businessSegment?: unknown; selectedSegment?: unknown } | null | undefined;
export function restrictedSegmentAccount(account: Account): boolean;
export function activeCustomerSegment(account: Account): Segment | null;
export function loginSegmentAllowed(account: Account, selection: unknown): boolean;
export function scopeCustomerProducts<T extends { segment?: unknown }>(products: T[], account: Account): T[];
