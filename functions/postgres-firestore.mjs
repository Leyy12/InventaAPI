// Firestore-compatible data layer backed by Supabase Postgres.
// Each Firestore collection is a table (id text, data jsonb, created_at, updated_at),
// created by supabase/migrations. The classes below mirror the parts of the
// firebase-admin Firestore API this codebase uses, so routes and services keep
// calling db.collection(...).doc(...).get() unchanged.
//
// Values are stored as JSON. Timestamps are stored as {"__ts": "<ISO>"} so they
// sort correctly and read back as Timestamp objects (toDate/toMillis/_seconds).
// Transactions run at SERIALIZABLE isolation and retry on conflicts, like
// Firestore's optimistic transactions.
import pg from 'pg';

const TABLE_NAME = /^[a-z][a-z0-9_]{0,62}$/u;
const MAX_TX_ATTEMPTS = 5;

export class Timestamp {
    constructor(seconds, nanoseconds = 0) {
        this._seconds = seconds;
        this._nanoseconds = nanoseconds;
    }
    static fromMillis(ms) {
        const seconds = Math.floor(ms / 1000);
        return new Timestamp(seconds, Math.round((ms - seconds * 1000) * 1e6));
    }
    static fromDate(date) { return Timestamp.fromMillis(date.getTime()); }
    static now() { return Timestamp.fromMillis(Date.now()); }
    get seconds() { return this._seconds; }
    get nanoseconds() { return this._nanoseconds; }
    toMillis() { return this._seconds * 1000 + Math.floor(this._nanoseconds / 1e6); }
    toDate() { return new Date(this.toMillis()); }
    isEqual(other) { return other instanceof Timestamp && other.toMillis() === this.toMillis(); }
    valueOf() { return String(this.toMillis()).padStart(16, '0'); }
}

class Sentinel {
    constructor(kind, operand) { this.kind = kind; this.operand = operand; }
}

export const FieldValue = Object.freeze({
    serverTimestamp: () => new Sentinel('serverTimestamp'),
    delete: () => new Sentinel('delete'),
    increment: n => new Sentinel('increment', n),
    arrayUnion: (...items) => new Sentinel('arrayUnion', items),
    arrayRemove: (...items) => new Sentinel('arrayRemove', items),
});

const DOCUMENT_ID = Symbol('documentId');
export const FieldPath = Object.freeze({ documentId: () => DOCUMENT_ID });

function firestoreError(code, message) {
    const error = new Error(message);
    error.code = code;
    return error;
}

const isPlainObject = v => v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype
    || (v !== null && typeof v === 'object' && Object.getPrototypeOf(v) === null);
const isTimestampLike = v => v instanceof Timestamp
    || (v && typeof v === 'object' && typeof v.toDate === 'function' && typeof v.toMillis === 'function');

// ─── JSON encoding ──────────────────────────────────────────────────────────
export function encode(value, now = new Date()) {
    if (value === null) return null;
    if (value instanceof Date) return { __ts: value.toISOString() };
    if (isTimestampLike(value)) return { __ts: value.toDate().toISOString() };
    if (value instanceof Sentinel) {
        if (value.kind === 'serverTimestamp') return { __ts: now.toISOString() };
        throw firestoreError(3, `FieldValue.${value.kind}() is not valid here.`);
    }
    if (value instanceof DocumentReference) return { __ref: value.path };
    // firebase-admin DocumentReference (when copying data across from Firestore).
    if (typeof value === 'object' && typeof value.path === 'string' && typeof value.collection === 'function'
        && typeof value.get === 'function') return { __ref: value.path };
    if (Array.isArray(value)) return value.map(item => item === undefined ? null : encode(item, now));
    if (typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) if (item !== undefined) out[key] = encode(item, now);
        return out;
    }
    if (typeof value === 'number' && !Number.isFinite(value)) return null;
    return value;
}

function decode(value, db) {
    if (Array.isArray(value)) return value.map(item => decode(item, db));
    if (value && typeof value === 'object') {
        const keys = Object.keys(value);
        if (keys.length === 1 && keys[0] === '__ts' && typeof value.__ts === 'string') return Timestamp.fromDate(new Date(value.__ts));
        if (keys.length === 1 && keys[0] === '__ref' && typeof value.__ref === 'string' && db) return db.doc(value.__ref);
        const out = {};
        for (const key of keys) out[key] = decode(value[key], db);
        return out;
    }
    return value;
}

const splitPath = path => (typeof path === 'string' ? path.split('.') : path);

// Applies one field write (value may be a FieldValue sentinel) at a dotted path.
function applyField(target, segments, value, now) {
    if (segments.some(segment => ['__proto__', 'constructor', 'prototype'].includes(segment))) throw new Error('Invalid field name.');
    let node = target;
    for (const segment of segments.slice(0, -1)) {
        if (!isPlainObject(node[segment])) node[segment] = {};
        node = node[segment];
    }
    const last = segments[segments.length - 1];
    if (value instanceof Sentinel) {
        const current = node[last];
        switch (value.kind) {
            case 'delete': delete node[last]; return;
            case 'serverTimestamp': node[last] = { __ts: now.toISOString() }; return;
            case 'increment': node[last] = (typeof current === 'number' ? current : 0) + value.operand; return;
            case 'arrayUnion': {
                const list = Array.isArray(current) ? [...current] : [];
                for (const item of value.operand.map(i => encode(i, now))) {
                    if (!list.some(existing => JSON.stringify(existing) === JSON.stringify(item))) list.push(item);
                }
                node[last] = list;
                return;
            }
            case 'arrayRemove': {
                const remove = value.operand.map(i => JSON.stringify(encode(i, now)));
                node[last] = Array.isArray(current) ? current.filter(item => !remove.includes(JSON.stringify(item))) : [];
                return;
            }
        }
    }
    node[last] = encode(value, now);
}

// set(data, { merge: true }) merges nested maps; a plain set replaces the document.
function mergeInto(target, data, now) {
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        if (isPlainObject(value)) {
            if (!isPlainObject(target[key])) target[key] = {};
            mergeInto(target[key], value, now);
        } else {
            applyField(target, [key], value, now);
        }
    }
    return target;
}

function buildSetData(existing, data, options, now) {
    if (options?.merge) return mergeInto(structuredClone(existing || {}), data, now);
    if (Array.isArray(options?.mergeFields)) {
        const next = structuredClone(existing || {});
        for (const field of options.mergeFields) {
            const segments = splitPath(field);
            let value = data;
            for (const segment of segments) value = value?.[segment];
            applyField(next, segments, value === undefined ? FieldValue.delete() : value, now);
        }
        return next;
    }
    return mergeInto({}, data, now);
}

function buildUpdateData(existing, args, now) {
    const pairs = [];
    if (args.length === 1 && args[0] && typeof args[0] === 'object') pairs.push(...Object.entries(args[0]));
    else for (let i = 0; i < args.length; i += 2) pairs.push([args[i], args[i + 1]]);
    const next = structuredClone(existing);
    for (const [path, value] of pairs) if (value !== undefined) applyField(next, splitPath(path), value, now);
    return next;
}

// Copies decoded data while keeping Timestamp and DocumentReference instances.
function cloneDecoded(value) {
    if (Array.isArray(value)) return value.map(cloneDecoded);
    if (isPlainObject(value)) {
        const out = {};
        for (const [key, item] of Object.entries(value)) out[key] = cloneDecoded(item);
        return out;
    }
    return value;
}

// ─── Snapshots ─────────────────────────────────────────────────────────────
class DocumentSnapshot {
    constructor(ref, row, db, fields = null) {
        this.ref = ref;
        this.id = ref.id;
        this.exists = Boolean(row);
        this._data = row ? decode(row.data, db) : undefined;
        if (row && fields) {
            const picked = {};
            for (const field of fields) {
                const segments = splitPath(field);
                let value = this._data;
                for (const segment of segments) value = value?.[segment];
                if (value !== undefined) applyField(picked, segments, value, new Date());
            }
            this._data = decode(picked, db);
        }
        this.createTime = row ? Timestamp.fromDate(new Date(row.created_at)) : undefined;
        this.updateTime = row ? Timestamp.fromDate(new Date(row.updated_at)) : undefined;
        this.readTime = Timestamp.now();
    }
    data() { return this._data === undefined ? undefined : cloneDecoded(this._data); }
    get(field) {
        let value = this._data;
        for (const segment of splitPath(field)) value = value?.[segment];
        return value;
    }
}

class QuerySnapshot {
    constructor(query, docs) {
        this.query = query;
        this.docs = docs;
        this.size = docs.length;
        this.empty = docs.length === 0;
        this.readTime = Timestamp.now();
    }
    forEach(callback, thisArg) { this.docs.forEach(callback, thisArg); }
    docChanges() { return this.docs.map((doc, newIndex) => ({ type: 'added', doc, oldIndex: -1, newIndex })); }
}

// ─── References and queries ────────────────────────────────────────────────
class DocumentReference {
    constructor(db, collectionId, id) {
        this.firestore = db;
        this.id = id;
        this._collectionId = collectionId;
    }
    get path() { return `${this._collectionId}/${this.id}`; }
    get parent() { return new CollectionReference(this.firestore, this._collectionId); }
    isEqual(other) { return other instanceof DocumentReference && other.path === this.path; }
    collection() { throw firestoreError(12, 'Subcollections are not supported by the Supabase data layer.'); }
    get() { return this.firestore._run(client => readDoc(client, this)); }
    set(data, options) { return this.firestore._writeOne(client => writeSet(client, this, data, options)); }
    update(...args) { return this.firestore._writeOne(client => writeUpdate(client, this, args)); }
    create(data) { return this.firestore._writeOne(client => writeCreate(client, this, data)); }
    delete() { return this.firestore._writeOne(client => writeDelete(client, this)); }
}

class Query {
    constructor(db, collectionId, state = {}) {
        this.firestore = db;
        this._collectionId = collectionId;
        this._state = { filters: [], orders: [], limit: null, cursor: null, fields: null, ...state };
    }
    _with(patch) { return new Query(this.firestore, this._collectionId, { ...this._state, ...patch }); }
    where(field, op, value) {
        if (field && typeof field === 'object' && !Array.isArray(field) && field !== DOCUMENT_ID) {
            throw firestoreError(12, 'Composite filters are not supported by the Supabase data layer.');
        }
        return this._with({ filters: [...this._state.filters, { field, op, value }] });
    }
    orderBy(field, direction = 'asc') {
        return this._with({ orders: [...this._state.orders, { field, desc: String(direction).toLowerCase() === 'desc' }] });
    }
    limit(n) { return this._with({ limit: n }); }
    limitToLast() { throw firestoreError(12, 'limitToLast is not supported by the Supabase data layer.'); }
    offset(n) { return this._with({ offset: n }); }
    select(...fields) { return this._with({ fields }); }
    startAfter(...values) { return this._with({ cursor: { values, inclusive: false } }); }
    startAt(...values) { return this._with({ cursor: { values, inclusive: true } }); }
    count() {
        const query = this;
        return { get: () => query.firestore._run(async client => {
            const { text, params } = buildSelect(query, 'count');
            const { rows } = await client.query(text, params);
            const count = Number(rows[0].count);
            return { data: () => ({ count }) };
        }) };
    }
    get() { return this.firestore._run(client => runQuery(client, this)); }
    onSnapshot() { throw firestoreError(12, 'Realtime listeners are not supported by the Supabase data layer.'); }
}

class CollectionReference extends Query {
    constructor(db, collectionId) {
        super(db, collectionId);
        this.id = collectionId;
        this.path = collectionId;
    }
    doc(id) {
        if (id === undefined) id = randomId();
        if (typeof id !== 'string' || !id || id.includes('/')) throw firestoreError(3, 'Invalid document id.');
        return new DocumentReference(this.firestore, this._collectionId, id);
    }
    async add(data) {
        const ref = this.doc();
        await ref.create(data);
        return ref;
    }
    async listDocuments() {
        const snapshot = await this.select().get();
        return snapshot.docs.map(doc => doc.ref);
    }
}

const ID_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
function randomId() {
    const bytes = crypto.getRandomValues(new Uint8Array(20));
    let id = '';
    for (const byte of bytes) id += ID_CHARS[byte % ID_CHARS.length];
    return id;
}

function table(collectionId) {
    if (!TABLE_NAME.test(collectionId)) throw firestoreError(3, `Invalid collection name: ${collectionId}`);
    return `public."${collectionId}"`;
}

// ─── SQL ───────────────────────────────────────────────────────────────────
function fieldSql(field, params) {
    if (field === DOCUMENT_ID || field === '__name__') return { sql: 'id', isId: true };
    params.push(splitPath(field));
    return { sql: `(data #> $${params.length}::text[])`, isId: false };
}

function valueParam(value, isId, params) {
    if (isId) {
        params.push(value instanceof DocumentReference ? value.id : String(value));
        return `$${params.length}::text`;
    }
    params.push(JSON.stringify(encode(value, new Date())));
    return `$${params.length}::jsonb`;
}

const RANGE = { '<': '<', '<=': '<=', '>': '>', '>=': '>=' };

function filterSql({ field, op, value }, params) {
    const f = fieldSql(field, params);
    if (op === '==') {
        if (!f.isId && value === null) return `${f.sql} = 'null'::jsonb`;
        return `${f.sql} = ${valueParam(value, f.isId, params)}`;
    }
    if (op === '!=') return `${f.sql} is not null and ${f.sql} <> ${valueParam(value, f.isId, params)}`;
    if (RANGE[op]) {
        const v = valueParam(value, f.isId, params);
        return f.isId ? `${f.sql} ${RANGE[op]} ${v}` : `jsonb_typeof(${f.sql}) = jsonb_typeof(${v}) and ${f.sql} ${RANGE[op]} ${v}`;
    }
    if (op === 'in' || op === 'not-in') {
        const list = (value || []).map(item => (f.isId ? (item instanceof DocumentReference ? item.id : String(item)) : JSON.stringify(encode(item, new Date()))));
        params.push(list);
        const cast = f.isId ? 'text[]' : 'jsonb[]';
        return op === 'in' ? `${f.sql} = any($${params.length}::${cast})`
            : `${f.sql} is not null and not (${f.sql} = any($${params.length}::${cast}))`;
    }
    if (op === 'array-contains') {
        params.push(JSON.stringify([encode(value, new Date())]));
        return `jsonb_typeof(${f.sql}) = 'array' and ${f.sql} @> $${params.length}::jsonb`;
    }
    if (op === 'array-contains-any') {
        const clauses = (value || []).map(item => {
            params.push(JSON.stringify([encode(item, new Date())]));
            return `${f.sql} @> $${params.length}::jsonb`;
        });
        return clauses.length ? `jsonb_typeof(${f.sql}) = 'array' and (${clauses.join(' or ')})` : 'false';
    }
    throw firestoreError(3, `Unsupported query operator: ${op}`);
}

function effectiveOrders(state) {
    const orders = [...state.orders];
    const hasId = orders.some(o => o.field === DOCUMENT_ID || o.field === '__name__');
    if (!hasId) orders.push({ field: DOCUMENT_ID, desc: orders.length ? orders[orders.length - 1].desc : false });
    return orders;
}

function cursorSql(state, orders, params) {
    const { values, inclusive } = state.cursor;
    let cursorValues;
    if (values.length === 1 && values[0] instanceof DocumentSnapshot) {
        const snap = values[0];
        cursorValues = orders.map(o => (o.field === DOCUMENT_ID || o.field === '__name__' ? snap.id : snap.get(o.field)));
    } else {
        cursorValues = values;
    }
    const used = orders.slice(0, cursorValues.length);
    const terms = [];
    for (let i = 0; i < used.length; i += 1) {
        const parts = [];
        for (let j = 0; j < i; j += 1) {
            const f = fieldSql(used[j].field, params);
            parts.push(`${f.sql} = ${valueParam(cursorValues[j], f.isId, params)}`);
        }
        const f = fieldSql(used[i].field, params);
        const last = i === used.length - 1;
        const op = used[i].desc ? (last && inclusive ? '<=' : '<') : (last && inclusive ? '>=' : '>');
        parts.push(`${f.sql} ${op} ${valueParam(cursorValues[i], f.isId, params)}`);
        terms.push(`(${parts.join(' and ')})`);
    }
    return terms.length ? `(${terms.join(' or ')})` : 'true';
}

function buildSelect(query, mode = 'rows') {
    const state = query._state;
    const params = [];
    const where = state.filters.map(filter => filterSql(filter, params));
    for (const order of state.orders) {
        const f = fieldSql(order.field, params);
        if (!f.isId) where.push(`${f.sql} is not null`);
    }
    const orders = effectiveOrders(state);
    if (state.cursor) where.push(cursorSql(state, orders, params));
    const whereSql = where.length ? ` where ${where.join(' and ')}` : '';
    if (mode === 'count') {
        const inner = `select 1 from ${table(query._collectionId)}${whereSql}${state.limit != null ? ` limit ${Number(state.limit)}` : ''}`;
        return { text: `select count(*) as count from (${inner}) q`, params };
    }
    const orderSql = orders.map(o => `${fieldSql(o.field, params).sql} ${o.desc ? 'desc' : 'asc'}`).join(', ');
    let text = `select id, data, created_at, updated_at from ${table(query._collectionId)}${whereSql} order by ${orderSql}`;
    if (state.limit != null) text += ` limit ${Number(state.limit)}`;
    if (state.offset) text += ` offset ${Number(state.offset)}`;
    return { text, params };
}

async function runQuery(client, query) {
    const { text, params } = buildSelect(query);
    const { rows } = await client.query(text, params);
    const db = query.firestore;
    const docs = rows.map(row => new DocumentSnapshot(new DocumentReference(db, query._collectionId, row.id), row, db, query._state.fields));
    return new QuerySnapshot(query, docs);
}

async function readDoc(client, ref) {
    const { rows } = await client.query(`select id, data, created_at, updated_at from ${table(ref._collectionId)} where id = $1`, [ref.id]);
    return new DocumentSnapshot(ref, rows[0] || null, ref.firestore);
}

// Serializes concurrent writes to one document, including its first creation.
async function lockDoc(client, ref) {
    await client.query('select pg_advisory_xact_lock(hashtextextended($1, 0))', [ref.path]);
    const { rows } = await client.query(`select data from ${table(ref._collectionId)} where id = $1`, [ref.id]);
    return rows[0] ? rows[0].data : null;
}

async function upsert(client, ref, data) {
    await client.query(
        `insert into ${table(ref._collectionId)} (id, data) values ($1, $2::jsonb)
         on conflict (id) do update set data = excluded.data`,
        [ref.id, JSON.stringify(data)],
    );
}

async function writeSet(client, ref, data, options) {
    const existing = await lockDoc(client, ref);
    await upsert(client, ref, buildSetData(existing, data, options, new Date()));
}

async function writeUpdate(client, ref, args) {
    const existing = await lockDoc(client, ref);
    if (!existing) throw firestoreError(5, `No document to update: ${ref.path}`);
    await upsert(client, ref, buildUpdateData(existing, args, new Date()));
}

async function writeCreate(client, ref, data) {
    const existing = await lockDoc(client, ref);
    if (existing) throw firestoreError(6, `Document already exists: ${ref.path}`);
    await upsert(client, ref, buildSetData(null, data, null, new Date()));
}

async function writeDelete(client, ref) {
    await client.query(`delete from ${table(ref._collectionId)} where id = $1`, [ref.id]);
}

const WRITE_RESULT = () => ({ writeTime: Timestamp.now() });

// ─── Transactions and batches ──────────────────────────────────────────────
class Transaction {
    constructor(client) { this._client = client; }
    get(target) {
        if (target instanceof DocumentReference) return readDoc(this._client, target);
        if (target instanceof Query) return runQuery(this._client, target);
        throw firestoreError(3, 'Transaction.get expects a document reference or query.');
    }
    async getAll(...refs) { return Promise.all(refs.filter(r => r instanceof DocumentReference).map(ref => readDoc(this._client, ref))); }
    // Writes run in call order; a failure is held until the transaction finishes
    // so an unawaited rejection never escapes.
    _queue(work) {
        this._pending = (this._pending || Promise.resolve())
            .then(() => (this._error ? undefined : work()))
            .catch(error => { this._error ||= error; });
        return this;
    }
    async _flush() {
        await this._pending;
        if (this._error) throw this._error;
    }
    set(ref, data, options) { return this._queue(() => writeSet(this._client, ref, data, options)); }
    update(ref, ...args) { return this._queue(() => writeUpdate(this._client, ref, args)); }
    create(ref, data) { return this._queue(() => writeCreate(this._client, ref, data)); }
    delete(ref) { return this._queue(() => writeDelete(this._client, ref)); }
}

class WriteBatch {
    constructor(db) { this._db = db; this._ops = []; }
    set(ref, data, options) { this._ops.push(client => writeSet(client, ref, data, options)); return this; }
    update(ref, ...args) { this._ops.push(client => writeUpdate(client, ref, args)); return this; }
    create(ref, data) { this._ops.push(client => writeCreate(client, ref, data)); return this; }
    delete(ref) { this._ops.push(client => writeDelete(client, ref)); return this; }
    async commit() {
        const ops = this._ops;
        await this._db._transaction(async client => { for (const op of ops) await op(client); }, 'read committed');
        return ops.map(WRITE_RESULT);
    }
}

const RETRYABLE = new Set(['40001', '40P01']);

export class PostgresFirestore {
    // projectId names the Firebase project whose data this database holds, so
    // payment isolation checks (services/payment-isolation.js) keep working.
    constructor({ connectionString, projectId, max = 3 }) {
        this.projectId = projectId;
        this._pool = new pg.Pool({
            connectionString,
            max,
            idleTimeoutMillis: 10000,
            ssl: /localhost|127\.0\.0\.1/u.test(connectionString) ? false : { rejectUnauthorized: false },
        });
        this._pool.on('error', () => {});
    }
    collection(collectionId) { return new CollectionReference(this, collectionId); }
    doc(path) {
        const [collectionId, id, ...rest] = String(path).split('/');
        if (!collectionId || !id || rest.length) throw firestoreError(3, `Invalid document path: ${path}`);
        return new DocumentReference(this, collectionId, id);
    }
    batch() { return new WriteBatch(this); }
    bulkWriter() { throw firestoreError(12, 'bulkWriter is not supported by the Supabase data layer.'); }
    async listCollections() {
        const { rows } = await this._pool.query(
            `select table_name from information_schema.columns
             where table_schema = 'public' and column_name = 'data' order by table_name`);
        return rows.map(row => this.collection(row.table_name));
    }
    async getAll(...refs) { return this._run(client => Promise.all(refs.map(ref => readDoc(client, ref)))); }

    async _run(work) {
        const client = await this._pool.connect();
        try { return await work(client); } finally { client.release(); }
    }
    _writeOne(work) { return this._transaction(work, 'read committed').then(WRITE_RESULT); }

    async _transaction(work, isolation = 'serializable') {
        const client = await this._pool.connect();
        try {
            await client.query(`begin isolation level ${isolation === 'serializable' ? 'serializable' : 'read committed'}`);
            const result = await work(client);
            await client.query('commit');
            return result;
        } catch (error) {
            await client.query('rollback').catch(() => {});
            throw error;
        } finally {
            client.release();
        }
    }

    async runTransaction(updateFunction, options = {}) {
        const attempts = options.maxAttempts || MAX_TX_ATTEMPTS;
        for (let attempt = 1; ; attempt += 1) {
            try {
                return await this._transaction(async client => {
                    const tx = new Transaction(client);
                    let result;
                    try { result = await updateFunction(tx); } finally { await tx._pending; }
                    await tx._flush();
                    return result;
                });
            } catch (error) {
                if (!RETRYABLE.has(error?.code) || attempt >= attempts) {
                    if (RETRYABLE.has(error?.code)) throw firestoreError(10, 'Transaction aborted after repeated conflicts.');
                    throw error;
                }
                await new Promise(resolve => setTimeout(resolve, 20 * 2 ** attempt + Math.random() * 20));
            }
        }
    }

    async terminate() { await this._pool.end(); }
}
