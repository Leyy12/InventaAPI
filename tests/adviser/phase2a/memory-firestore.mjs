// Optimistic transaction adapter: concurrent readers conflict and retry the
// entire callback. No SDK, credentials, sockets, or production configuration.
export function memoryFirestore(initial = {}, { creationTimes = {} } = {}) {
  const records = new Map(Object.entries(initial).map(([path, data]) => [path, { version: 1, data: structuredClone(data) }]));
  let sequence = 0;
  const db = { retries: 0, queries: 0, failCommit: false };
  const snapshot = path => {
    const entry = records.get(path);
    return { id: path.split('/').at(-1), exists: Boolean(entry?.data), data: () => structuredClone(entry?.data),
      ...(creationTimes[path] ? { createTime: { toDate: () => new Date(creationTimes[path]) } } : {}) };
  };
  const write = (path, data, kind) => {
    const existing = records.get(path);
    if (kind === 'create' && existing?.data) throw new Error('ALREADY_EXISTS');
    if (kind === 'update' && !existing?.data) throw new Error('NOT_FOUND');
    records.set(path, { version: (existing?.version || 0) + 1,
      data: kind === 'delete' ? null : structuredClone(kind === 'update' ? { ...existing.data, ...data } : data) });
  };
  const document = path => ({
    path, id: path.split('/').at(-1),
    get: async () => snapshot(path),
    create: async data => write(path, data, 'create'),
    set: async data => write(path, data, 'set'),
    update: async data => write(path, data, 'update'),
    delete: async () => write(path, null, 'delete'),
  });
  const collection = (name, filters = [], maximum = Infinity) => ({
    doc: id => document(`${name}/${id}`),
    add: async data => { const ref = document(`${name}/auto-${++sequence}`); await ref.create(data); return ref; },
    where: (field, operator, value) => {
      if (operator !== '==') throw new Error('Unsupported test query');
      return collection(name, [...filters, [field, value]], maximum);
    },
    limit: value => collection(name, filters, value),
    get: async () => {
      db.queries += 1;
      const docs = [...records.keys()].filter(path => path.split('/')[0] === name)
        .map(snapshot).filter(doc => doc.exists && filters.every(([field, value]) => doc.data()[field] === value))
        .slice(0, maximum);
      return { docs, empty: !docs.length, size: docs.length };
    },
  });
  db.collection = name => collection(name);
  db.read = path => snapshot(path).data();
  db.runTransaction = async callback => {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const versions = new Map();
      const writes = [];
      const result = await callback({
        get: async ref => {
          if (writes.length) throw new Error('Transaction read after write');
          versions.set(ref.path, records.get(ref.path)?.version || 0);
          return snapshot(ref.path);
        },
        set: (ref, data) => writes.push([ref.path, data, 'set']),
        update: (ref, data) => writes.push([ref.path, data, 'update']),
      });
      // Let competing transactions commit between reading and validating versions.
      await Promise.resolve();
      if ([...versions].some(([path, version]) => (records.get(path)?.version || 0) !== version)) {
        db.retries += 1;
        continue;
      }
      if (db.failCommit) throw new Error('Simulated unavailable database');
      for (const args of writes) write(...args);
      return result;
    }
    throw new Error('Transaction retry limit');
  };
  return db;
}

export async function invoke(handler, { token = 'owner-token', body = {}, query = {}, id = 'key-a', headers = {}, ...other } = {}) {
  const req = { headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...headers },
    body, query, params: { id }, path: '/catalog', ...other };
  const res = { statusCode: 200, headers: {},
    set(name, value) { this.headers[name] = value; return this; },
    status(code) { this.statusCode = code; return this; },
    json(value) { this.body = value; return this; },
  };
  let nextCalled = false;
  await handler(req, res, () => { nextCalled = true; });
  return { ...res, req, nextCalled };
}
