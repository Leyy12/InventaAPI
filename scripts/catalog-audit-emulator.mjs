// Read-only emulator adapter: no SDK, credentials, .env, DNS, or remote hosts.
import { request } from 'node:http';

function decode(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) return (value.arrayValue.values || []).map(decode);
  if ('mapValue' in value) return Object.fromEntries(Object.entries(value.mapValue.fields || {}).map(([key, field]) => [key, decode(field)]));
  throw new Error('Unsupported export field type; provide a reviewed local JSON export.');
}

export async function readEmulatorCatalog(host, project) {
  const match = /^127\.0\.0\.1:([0-9]{1,5})$/u.exec(host);
  const port = Number(match?.[1]);
  if (!match || port < 1 || port > 65535) throw new Error('Audit requires literal localhost 127.0.0.1 and a valid port.');
  if (typeof project !== 'string' || !/^demo-[a-z0-9-]{1,50}$/u.test(project)) throw new Error('Audit requires a demo project.');
  async function collection(name) {
    const records = [];
    let nextPageToken;
    const seenTokens = new Set();
    do {
      const query = new URLSearchParams({ pageSize: '500', ...(nextPageToken ? { pageToken: nextPageToken } : {}) });
      const body = await new Promise((resolve, reject) => {
        const req = request({ hostname: '127.0.0.1', port, method: 'GET', agent: false,
          path: `/v1/projects/${project}/databases/(default)/documents/${name}?${query}`,
          // Emulator's fixed rules bypass; not a credential and never sent elsewhere.
          headers: { Authorization: 'Bearer owner' } }, res => {
          let data = '';
          res.setEncoding('utf8');
          res.on('data', chunk => {
            data += chunk;
            if (data.length > 10000000) req.destroy(new Error('Emulator audit response too large.'));
          });
          res.on('error', reject);
          res.on('end', () => {
            if (res.statusCode !== 200) return reject(new Error(`Emulator audit returned HTTP ${res.statusCode}; redirects are not followed.`));
            try { resolve(JSON.parse(data)); } catch (error) { reject(error); }
          });
        });
        req.setTimeout(30000, () => req.destroy(new Error('Emulator audit timed out.')));
        req.on('error', reject);
        req.end();
      });
      for (const document of body.documents || []) records.push({ id: document.name.split('/').at(-1),
        data: Object.fromEntries(Object.entries(document.fields || {}).map(([key, value]) => [key, decode(value)])) });
      if (records.length > 10000) throw new Error('Emulator audit limit exceeded; use a local export.');
      nextPageToken = body.nextPageToken;
      if (nextPageToken && seenTokens.has(nextPageToken)) throw new Error('Emulator audit repeated a page token.');
      seenTokens.add(nextPageToken);
    } while (nextPageToken);
    return records;
  }
  return { products: await collection('products'), reservations: await collection('product_submission_identity') };
}
