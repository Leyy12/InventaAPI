// Copies Firestore data into the Supabase tables, one page at a time, so an
// admin can run it from the admin panel without hitting serverless time limits.
// Rows are upserted by document id, so a copy can be re-run safely to pick up
// anything that changed; Firestore itself is only read, never modified.
import { encode } from '../database/postgres-firestore.js';

const PAGE_SIZE = 400;

const iso = time => (time && typeof time.toDate === 'function' ? time.toDate().toISOString() : null);

export function createSupabaseCopy({ source, target, documentId, enabled }) {
    async function targetTables() {
        const collections = await target.listCollections();
        return collections.map(col => col.id);
    }

    async function plan() {
        const tables = await targetTables();
        const sourceIds = (await source.listCollections()).map(col => col.id).sort();
        return {
            collections: sourceIds.filter(id => tables.includes(id)),
            skipped: sourceIds.filter(id => !tables.includes(id)),
        };
    }

    async function copyPage(collection, cursor) {
        let query = source.collection(collection).orderBy(documentId, 'asc').limit(PAGE_SIZE);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        if (snapshot.empty) return { copied: 0, nextCursor: null };
        const rows = snapshot.docs.map(doc => ({
            id: doc.id,
            data: encode(doc.data()),
            created_at: iso(doc.createTime),
            updated_at: iso(doc.updateTime),
        }));
        await target._run(client => client.query(
            `insert into public."${collection}" (id, data, created_at, updated_at)
             select r.id, r.data, coalesce(r.created_at, now()), coalesce(r.updated_at, now())
             from jsonb_to_recordset($1::jsonb) as r(id text, data jsonb, created_at timestamptz, updated_at timestamptz)
             on conflict (id) do update set data = excluded.data, created_at = excluded.created_at`,
            [JSON.stringify(rows)],
        ));
        const last = snapshot.docs[snapshot.docs.length - 1].id;
        return { copied: rows.length, nextCursor: snapshot.size < PAGE_SIZE ? null : last };
    }

    // POST body { collection?, cursor? }; the response says what to send next.
    async function step(req, res) {
        if (!enabled()) return res.status(409).json({ error: 'Copying is off: the API already reads Supabase, or SUPABASE_DB_URL is missing.' });
        try {
            const { collections, skipped } = await plan();
            const collection = req.body?.collection || collections[0];
            if (!collection) return res.json({ done: true, collections, skipped });
            if (!collections.includes(collection)) return res.status(400).json({ error: 'Unknown collection.' });
            const { copied, nextCursor } = await copyPage(collection, req.body?.cursor || null);
            const next = nextCursor ? collection : collections[collections.indexOf(collection) + 1] || null;
            return res.json({ collection, copied, next: next ? { collection: next, cursor: nextCursor } : null,
                done: !next, collections, skipped });
        } catch (error) {
            console.error('[Supabase copy] Failed:', error.message);
            return res.status(500).json({ error: 'Copy step failed. It is safe to retry.' });
        }
    }

    // Document counts on both sides, to confirm the copy is complete.
    async function status(req, res) {
        if (!enabled()) return res.status(409).json({ error: 'Copying is off: the API already reads Supabase, or SUPABASE_DB_URL is missing.' });
        try {
            const { collections, skipped } = await plan();
            const counts = [];
            for (const collection of collections) {
                const firestore = (await source.collection(collection).count().get()).data().count;
                const supabase = (await target.collection(collection).count().get()).data().count;
                counts.push({ collection, firestore, supabase, match: firestore === supabase });
            }
            return res.json({ counts, skipped, allMatch: counts.every(c => c.match) });
        } catch (error) {
            console.error('[Supabase copy] Status failed:', error.message);
            return res.status(500).json({ error: 'Could not compare the databases.' });
        }
    }

    return { step, status };
}
