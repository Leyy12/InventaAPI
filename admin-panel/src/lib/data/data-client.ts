// Small document-style data client (collection/doc/query/getDocs/onSnapshot).
// Reads and writes go to the InventaAPI /api/v1/client-db endpoint, which checks
// access with services/client-db-rules.js; data lives in Supabase Postgres.
// Realtime listeners are polling.
// Keep this file identical in dashboard/ and admin-panel/.
import { auth } from "@/lib/supabase/config";

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:5002";
const POLL_MS = 30000;

export class Timestamp {
  constructor(readonly seconds: number, readonly nanoseconds: number) {}
  static fromMillis(ms: number) {
    const seconds = Math.floor(ms / 1000);
    return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
  }
  static fromDate(date: Date) { return Timestamp.fromMillis(date.getTime()); }
  static now() { return Timestamp.fromMillis(Date.now()); }
  toMillis() { return this.seconds * 1000 + Math.floor(this.nanoseconds / 1e6); }
  toDate() { return new Date(this.toMillis()); }
  isEqual(other: Timestamp) { return other instanceof Timestamp && other.toMillis() === this.toMillis(); }
  valueOf() { return String(this.toMillis()).padStart(16, "0"); }
  toJSON() { return { seconds: this.seconds, nanoseconds: this.nanoseconds }; }
}

export class DataError extends Error {
  constructor(readonly code: string, message: string) { super(message); this.name = "DataError"; }
}

type Db = unknown;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DocumentData = { [field: string]: any };
export interface CollectionReference { readonly type: "collection"; readonly id: string; readonly path: string }
export interface DocumentReference { readonly type: "document"; readonly id: string; readonly path: string; readonly parent: CollectionReference }
type Filter = [string, string, unknown];
type Order = [string, "asc" | "desc"];
export interface Query { readonly type: "query"; readonly collection: string; readonly filters: Filter[]; readonly orders: Order[]; readonly max?: number }
type Constraint = { kind: "where"; filter: Filter } | { kind: "orderBy"; order: Order } | { kind: "limit"; value: number };

const SERVER_TIMESTAMP = { __fv: "serverTimestamp" };
const DOCUMENT_ID = "__name__" as const;

export const collection = (_db: Db, name: string): CollectionReference => ({ type: "collection", id: name, path: name });

function randomId() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  return Array.from(crypto.getRandomValues(new Uint8Array(20)), byte => chars[byte % chars.length]).join("");
}

export function doc(parent: Db | CollectionReference, ...segments: string[]): DocumentReference {
  const base = (parent as CollectionReference)?.type === "collection" ? [(parent as CollectionReference).id, ...segments] : segments;
  const [name, id = randomId()] = base;
  return { type: "document", id, path: `${name}/${id}`, parent: collection(null, name) };
}

export const where = (field: string | typeof DOCUMENT_ID, op: string, value: unknown): Constraint =>
  ({ kind: "where", filter: [field === DOCUMENT_ID ? "__name__" : String(field), op, value] });
export const orderBy = (field: string | typeof DOCUMENT_ID, direction: "asc" | "desc" = "asc"): Constraint =>
  ({ kind: "orderBy", order: [field === DOCUMENT_ID ? "__name__" : String(field), direction] });
export const limit = (value: number): Constraint => ({ kind: "limit", value });
export const documentId = () => DOCUMENT_ID;
export const serverTimestamp = () => SERVER_TIMESTAMP;

export function query(base: CollectionReference | Query, ...constraints: Constraint[]): Query {
  const start: Query = base.type === "query" ? base : { type: "query", collection: base.id, filters: [], orders: [] };
  return constraints.reduce<Query>((current, constraint) => constraint.kind === "where" ? { ...current, filters: [...current.filters, constraint.filter] }
    : constraint.kind === "orderBy" ? { ...current, orders: [...current.orders, constraint.order] } : { ...current, max: constraint.value }, start);
}

function toWire(value: unknown): unknown {
  if (value === SERVER_TIMESTAMP) return value;
  if (value instanceof Date) return { __ts: value.toISOString() };
  if (value instanceof Timestamp) return { __ts: value.toDate().toISOString() };
  if (Array.isArray(value)) return value.map(toWire);
  if (value && typeof value === "object") {
    const out: DocumentData = {};
    for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = toWire(item);
    return out;
  }
  return value;
}

function fromWire(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(fromWire);
  if (value && typeof value === "object") {
    const record = value as DocumentData;
    const keys = Object.keys(record);
    if (keys.length === 1 && typeof record.__ts === "string") return Timestamp.fromDate(new Date(record.__ts));
    if (keys.length === 1 && typeof record.__ref === "string") return doc(null, ...record.__ref.split("/"));
    const out: DocumentData = {};
    for (const key of keys) out[key] = fromWire(record[key]);
    return out;
  }
  return value;
}

async function call<T>(body: DocumentData): Promise<T> {
  const token = await auth?.currentUser?.getIdToken?.();
  const response = await fetch(`${API_BASE}/api/v1/client-db`, {
    method: "POST", cache: "no-store",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new DataError(payload.code || "unavailable", payload.error || "Data service unavailable.");
  return payload as T;
}

export class DocumentSnapshot<T = DocumentData> {
  readonly id: string;
  constructor(readonly ref: DocumentReference, private readonly value: DocumentData | null) { this.id = ref.id; }
  exists(): this is QueryDocumentSnapshot<T> { return this.value !== null; }
  data(): T | undefined { return this.value === null ? undefined : (fromWire(this.value) as T); }
  get(field: string) {
    return field.split(".").reduce<unknown>((node, key) => (node && typeof node === "object" ? (node as DocumentData)[key] : undefined), this.data());
  }
}

export class QueryDocumentSnapshot<T = DocumentData> extends DocumentSnapshot<T> {
  data(): T { return super.data() as T; }
}

export class QuerySnapshot<T = DocumentData> {
  readonly size: number;
  readonly empty: boolean;
  constructor(readonly docs: QueryDocumentSnapshot<T>[]) { this.size = docs.length; this.empty = docs.length === 0; }
  forEach(callback: (doc: QueryDocumentSnapshot<T>) => void) { this.docs.forEach(callback); }
}

export async function getDoc(ref: DocumentReference) {
  const result = await call<{ exists: boolean; data: DocumentData | null }>({ op: "get", path: ref.path });
  return new DocumentSnapshot(ref, result.exists ? result.data : null);
}
export const getDocFromServer = getDoc;

export async function getDocs(target: CollectionReference | Query) {
  const q = query(target);
  const result = await call<{ docs: { id: string; data: DocumentData }[] }>({
    op: "query", collection: q.collection, filters: q.filters.map(([f, op, v]) => [f, op, toWire(v)]), orderBy: q.orders, limit: q.max,
  });
  return new QuerySnapshot(result.docs.map(item => new QueryDocumentSnapshot(doc(null, q.collection, item.id), item.data)));
}

type Next<S> = ((snapshot: S) => void) | { next?: (snapshot: S) => void; error?: (error: Error) => void };

// Polls instead of streaming: delivers on start and then every 30 seconds.
export function onSnapshot(target: DocumentReference, next: Next<DocumentSnapshot>, error?: (error: Error) => void): () => void;
export function onSnapshot(target: CollectionReference | Query, next: Next<QuerySnapshot>, error?: (error: Error) => void): () => void;
export function onSnapshot<S>(target: CollectionReference | Query | DocumentReference,
  next: Next<S>, error?: (error: Error) => void): () => void {
  const onNext = typeof next === "function" ? next : next.next;
  const onError = typeof next === "function" ? error : next.error;
  let stopped = false;
  let last = "";
  const load = async () => {
    try {
      const snapshot = target.type === "document" ? await getDoc(target) : await getDocs(target);
      const signature = JSON.stringify(snapshot instanceof QuerySnapshot ? snapshot.docs.map(d => [d.id, d.data()]) : [snapshot.exists(), snapshot.data()]);
      if (!stopped && signature !== last) { last = signature; onNext?.(snapshot as S); }
    } catch (failure) {
      if (!stopped) onError?.(failure as Error);
    }
  };
  void load();
  const timer = setInterval(() => { void load(); }, POLL_MS);
  return () => {
    stopped = true;
    clearInterval(timer);
  };
}

type Write = { type: "set" | "update" | "delete"; path: string; data?: unknown; merge?: boolean };
const commit = (writes: Write[]) => call({ op: "write", writes });

export async function addDoc(ref: CollectionReference, data: DocumentData) {
  const result = await call<{ id: string }>({ op: "add", collection: ref.id, data: toWire(data) });
  return doc(ref, result.id);
}
export async function setDoc(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }) {
  await commit([{ type: "set", path: ref.path, data: toWire(data), merge: options?.merge === true }]);
}
export async function updateDoc(ref: DocumentReference, data: DocumentData) {
  await commit([{ type: "update", path: ref.path, data: toWire(data) }]);
}
export async function deleteDoc(ref: DocumentReference) {
  await commit([{ type: "delete", path: ref.path }]);
}

export function writeBatch(_db: Db) {
  const writes: Write[] = [];
  const batch = {
    set(ref: DocumentReference, data: DocumentData, options?: { merge?: boolean }) { writes.push({ type: "set", path: ref.path, data: toWire(data), merge: options?.merge === true }); return batch; },
    update(ref: DocumentReference, data: DocumentData) { writes.push({ type: "update", path: ref.path, data: toWire(data) }); return batch; },
    delete(ref: DocumentReference) { writes.push({ type: "delete", path: ref.path }); return batch; },
    async commit() { if (writes.length) await commit(writes); },
  };
  return batch;
}
