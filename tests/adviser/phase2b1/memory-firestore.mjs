// Optimistic, atomic transaction model with deterministic fault injection.
// No SDK/configuration/network. Failed commits publish no staged writes.
export function memoryFirestore(initial = {}) {
  const records = new Map(Object.entries(initial).map(([path, data]) => [path, { version: 1, data: structuredClone(data) }]));
  const db = { retries: 0, commits: 0, failRead: null, failWrite: null, failCommit: false, userWrites: 0 };
  const snapshot = path => ({ exists: records.has(path), data: () => structuredClone(records.get(path)?.data) });
  const document = path => ({ path, get: async () => snapshot(path) });
  db.collection = name => ({ doc: id => document(`${name}/${id}`) });
  db.read = path => snapshot(path).data();
  db.dump = () => Object.fromEntries([...records].map(([path, entry]) => [path, structuredClone(entry.data)]));
  db.seed = (path, data) => records.set(path, { version: (records.get(path)?.version || 0) + 1, data: structuredClone(data) });
  db.remove = path => records.delete(path);
  db.runTransaction = async callback => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const reads = new Map();
      const writes = [];
      const result = await callback({
        get: async ref => {
          if (writes.length) throw new Error('read after write');
          if (ref.path.startsWith(db.failRead || '\0')) throw new Error('read unavailable');
          reads.set(ref.path, records.get(ref.path)?.version || 0);
          return snapshot(ref.path);
        },
        set: (ref, data) => writes.push([ref.path, structuredClone(data), false]),
        update: (ref, data) => writes.push([ref.path, structuredClone(data), true]),
      });
      await Promise.resolve();
      if ([...reads].some(([path, version]) => (records.get(path)?.version || 0) !== version)) { db.retries++; continue; }
      if (db.failCommit || writes.some(([path]) => path.startsWith(db.failWrite || '\0'))) throw new Error('commit unavailable');
      if (writes.some(([path, , update]) => update && !records.has(path))) throw new Error('update missing');
      for (const [path, data, update] of writes) {
        records.set(path, { version: (records.get(path)?.version || 0) + 1,
          data: update ? { ...records.get(path).data, ...data } : data });
        if (path.startsWith('users/')) db.userWrites++;
      }
      if (writes.length) db.commits++;
      return result;
    }
    throw new Error('retry exhausted');
  };
  return db;
}

export async function invoke(handler, { token = 'owner-token', headers = {}, body = {}, query = {}, ...other } = {}) {
  const req = { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers }, body, query, ...other };
  const res = { statusCode: 200, headers: {}, set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; }, json(data) { this.body = data; return this; } };
  await handler(req, res);
  return res;
}
