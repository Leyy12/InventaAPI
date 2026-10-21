import express from 'express';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue, FieldPath } from '../database/firestore.js';
import { rulesFor } from '../services/client-db-rules.js';

// Browser data access for the dashboard and admin panel. The browsers used to
// read and write Firestore directly under firestore.rules; they now send the
// same operations here (see src/lib/data/firestore-client.ts in each app), and
// services/client-db-rules.js applies those rules before touching the database.
// This works the same whether the API stores data in Firebase or Supabase.

const MAX_RESULTS = 10000;
const FILTER_OPS = new Set(['==', '!=', '<', '<=', '>', '>=', 'in', 'not-in', 'array-contains', 'array-contains-any']);
const ID = /^[A-Za-z0-9_.@:+-]{1,200}$/u;

class ClientDbError extends Error {
    constructor(status, code, message) { super(message); Object.assign(this, { status, code }); }
}
const denied = () => new ClientDbError(403, 'permission-denied', 'Missing or insufficient permissions.');
const invalid = message => new ClientDbError(400, 'invalid-argument', message);

function parsePath(path) {
    const parts = typeof path === 'string' ? path.split('/') : [];
    if (parts.length !== 2 || !ID.test(parts[1])) throw invalid('Invalid document path.');
    const rules = rulesFor(parts[0]);
    if (!rules) throw denied();
    return { collection: parts[0], id: parts[1], rules };
}

function collectionRules(collection) {
    const rules = typeof collection === 'string' ? rulesFor(collection) : null;
    if (!rules) throw denied();
    return rules;
}

// Wire values: {"__ts": ISO} is a timestamp, {"__fv": "serverTimestamp"} is the sentinel.
// forRules gives the value the rules see; otherwise the value to write.
function fromWire(value, forRules, now) {
    if (Array.isArray(value)) return value.map(item => fromWire(item, forRules, now));
    if (value && typeof value === 'object') {
        if (typeof value.__ts === 'string' && Object.keys(value).length === 1) return new Date(value.__ts);
        if (value.__fv === 'serverTimestamp' && Object.keys(value).length === 1) return forRules ? now : FieldValue.serverTimestamp();
        const out = {};
        for (const [key, item] of Object.entries(value)) out[key] = fromWire(item, forRules, now);
        return out;
    }
    return value;
}

function toWire(value) {
    if (value instanceof Date) return { __ts: value.toISOString() };
    if (value && typeof value.toDate === 'function' && typeof value.toMillis === 'function') return { __ts: value.toDate().toISOString() };
    if (value && typeof value === 'object' && typeof value.path === 'string' && typeof value.collection === 'function') return { __ref: value.path };
    if (Array.isArray(value)) return value.map(toWire);
    if (value && typeof value === 'object') {
        const out = {};
        for (const [key, item] of Object.entries(value)) out[key] = toWire(item);
        return out;
    }
    return value;
}

function applyUpdate(before, fields) {
    const next = structuredClone(before);
    for (const [path, value] of Object.entries(fields)) {
        const segments = path.split('.');
        let node = next;
        for (const segment of segments.slice(0, -1)) {
            if (!node[segment] || typeof node[segment] !== 'object') node[segment] = {};
            node = node[segment];
        }
        node[segments[segments.length - 1]] = value;
    }
    return next;
}

function plainData(snapshot) {
    // Rule evaluation works on plain values; timestamps become Dates.
    const walk = value => {
        if (value && typeof value.toDate === 'function' && typeof value.toMillis === 'function') return value.toDate();
        if (Array.isArray(value)) return value.map(walk);
        if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype) {
            const out = {};
            for (const [key, item] of Object.entries(value)) out[key] = walk(item);
            return out;
        }
        return value;
    };
    return walk(snapshot.data() || {});
}

function buildContext(db, auth) {
    let admin;
    let registrations;
    return {
        auth,
        isAdmin: () => (admin ||= (async () => {
            if (!auth?.uid) return false;
            const snap = await db.collection('users').doc(auth.uid).get();
            const role = snap.exists ? snap.data()?.role : null;
            return typeof role === 'string' && role.toLowerCase() === 'admin';
        })()),
        registrationsAllowed: () => (registrations ||= (async () => {
            const snap = await db.collection('system').doc('settings').get();
            if (!snap.exists) return true;
            const data = snap.data() || {};
            return !Object.hasOwn(data, 'allowNewRegistrations') || data.allowNewRegistrations === true;
        })()),
    };
}

async function readQuery(db, ctx, body) {
    const rules = collectionRules(body.collection);
    let query = db.collection(body.collection);
    for (const filter of Array.isArray(body.filters) ? body.filters : []) {
        const [field, op, rawValue] = filter;
        if (typeof field !== 'string' || !FILTER_OPS.has(op)) throw invalid('Invalid filter.');
        query = query.where(field === '__name__' ? FieldPath.documentId() : field, op, fromWire(rawValue, true, new Date()));
    }
    for (const order of Array.isArray(body.orderBy) ? body.orderBy : []) {
        const [field, direction] = order;
        if (typeof field !== 'string' || !['asc', 'desc'].includes(direction)) throw invalid('Invalid order.');
        query = query.orderBy(field === '__name__' ? FieldPath.documentId() : field, direction);
    }
    const limit = Number.isSafeInteger(body.limit) && body.limit > 0 ? Math.min(body.limit, MAX_RESULTS) : MAX_RESULTS;
    const snapshot = await query.limit(limit).get();
    // Like Firestore, a query fails as a whole if any result is not readable.
    for (const doc of snapshot.docs) if (!(await rules.read(ctx, plainData(doc), doc.id))) throw denied();
    return { docs: snapshot.docs.map(doc => ({ id: doc.id, data: toWire(doc.data()) })) };
}

async function readDoc(db, ctx, body) {
    const { collection, id, rules } = parsePath(body.path);
    const snap = await db.collection(collection).doc(id).get();
    if (!(await rules.read(ctx, snap.exists ? plainData(snap) : undefined, id))) throw denied();
    return { id, exists: snap.exists, data: snap.exists ? toWire(snap.data()) : null };
}

// Checks one write against the rules inside a transaction and stages it.
async function stageWrite(tx, db, ctx, write, now) {
    const { collection, id, rules } = parsePath(write.path);
    const ref = db.collection(collection).doc(id);
    const snap = await tx.get(ref);
    const before = snap.exists ? plainData(snap) : null;
    const data = write.data && typeof write.data === 'object' ? write.data : {};
    if (write.type === 'delete') {
        if (before && !(await rules.delete(ctx, before, id))) throw denied();
        return () => tx.delete(ref);
    }
    if (write.type === 'update') {
        if (!before) throw new ClientDbError(404, 'not-found', 'No document to update.');
        if (!(await rules.update(ctx, before, applyUpdate(before, fromWire(data, true, now)), id))) throw denied();
        return () => tx.update(ref, fromWire(data, false, now));
    }
    if (write.type === 'set' || write.type === 'create') {
        const next = write.merge ? applyUpdate(before || {}, fromWire(data, true, now)) : fromWire(data, true, now);
        if (write.type === 'create' && before) throw new ClientDbError(409, 'already-exists', 'Document already exists.');
        const allowed = before ? await rules.update(ctx, before, next, id) : await rules.create(ctx, next, id);
        if (!allowed) throw denied();
        const value = fromWire(data, false, now);
        return () => (write.merge ? tx.set(ref, value, { merge: true }) : tx.set(ref, value));
    }
    throw invalid('Invalid write.');
}

async function runWrites(db, ctx, writes) {
    if (!Array.isArray(writes) || writes.length === 0 || writes.length > 500) throw invalid('Invalid writes.');
    const now = new Date();
    await db.runTransaction(async tx => {
        const staged = [];
        for (const write of writes) staged.push(await stageWrite(tx, db, ctx, write, now));
        staged.forEach(apply => apply());
    });
}

async function authenticate(req, verifyIdToken) {
    const header = req.headers.authorization || '';
    if (!header) return null;
    const match = /^Bearer (\S+)$/u.exec(header);
    if (!match) throw new ClientDbError(401, 'unauthenticated', 'Invalid authorization header.');
    try {
        const decoded = await verifyIdToken(match[1]);
        return { uid: decoded.uid, token: decoded };
    } catch {
        throw new ClientDbError(401, 'unauthenticated', 'Invalid or expired session.');
    }
}

export function createClientDbHandler({ getDb, verifyIdToken }) {
    return async (req, res) => {
        try {
            const body = req.body || {};
            const db = getDb();
            const ctx = buildContext(db, await authenticate(req, verifyIdToken));
            switch (body.op) {
                case 'get': return res.json(await readDoc(db, ctx, body));
                case 'query': return res.json(await readQuery(db, ctx, body));
                case 'add': {
                    collectionRules(body.collection);
                    const id = db.collection(body.collection).doc().id;
                    await runWrites(db, ctx, [{ type: 'create', path: `${body.collection}/${id}`, data: body.data }]);
                    return res.json({ id });
                }
                case 'write': {
                    await runWrites(db, ctx, body.writes);
                    return res.json({ ok: true });
                }
                default: throw invalid('Unknown operation.');
            }
        } catch (error) {
            if (error instanceof ClientDbError) return res.status(error.status).json({ code: error.code, error: error.message });
            console.error('[client-db] Failed:', error?.message);
            return res.status(503).json({ code: 'unavailable', error: 'Data service unavailable.' });
        }
    };
}

const router = express.Router();
router.post('/', createClientDbHandler({ getDb: () => getFirestore(), verifyIdToken: token => getAuth().verifyIdToken(token) }));
export default router;
