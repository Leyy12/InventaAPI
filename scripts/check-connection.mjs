// Checks the API's .env connections and explains what is wrong, in plain words.
//   npm run check:connection
// Never prints passwords or keys.
import 'dotenv/config';
import pg from 'pg';
import net from 'node:net';
import tls from 'node:tls';

const ok = msg => console.log(`  ✅ ${msg}`);
const bad = msg => console.log(`  ❌ ${msg}`);
const tip = msg => console.log(`     👉 ${msg}`);
let problems = 0;

console.log('\n1) SUPABASE_URL');
const url = process.env.SUPABASE_URL || '';
if (!url) { bad('SUPABASE_URL is empty in .env'); problems++; }
else if (!/^https:\/\/[a-z0-9]+\.supabase\.co$/u.test(url)) {
  bad(`SUPABASE_URL should look like https://xxxx.supabase.co with nothing after it. Yours: ${url}`); problems++;
} else {
  try {
    const res = await fetch(`${url}/auth/v1/health`, {
      headers: { apikey: process.env.SUPABASE_PUBLISHABLE_KEY || '' }, signal: AbortSignal.timeout(10000) });
    if (res.ok) ok(`Supabase Auth reachable (${url})`);
    else if (res.status === 401) { bad('Supabase answered 401: SUPABASE_PUBLISHABLE_KEY is wrong or from another project.'); problems++; }
    else { bad(`Supabase Auth answered HTTP ${res.status}.`); problems++; }
  } catch (error) { bad(`Cannot reach ${url}: ${error.cause?.code || error.message}`); tip('Check your internet connection.'); problems++; }
}

console.log('\n2) SUPABASE_SECRET_KEY / SUPABASE_PUBLISHABLE_KEY');
const secret = process.env.SUPABASE_SECRET_KEY || '';
const pub = process.env.SUPABASE_PUBLISHABLE_KEY || '';
if (!secret.startsWith('sb_secret_')) { bad('SUPABASE_SECRET_KEY must start with sb_secret_'); problems++; } else ok('SUPABASE_SECRET_KEY format looks right');
if (!pub.startsWith('sb_publishable_')) { bad('SUPABASE_PUBLISHABLE_KEY must start with sb_publishable_'); problems++; } else ok('SUPABASE_PUBLISHABLE_KEY format looks right');

console.log('\n3) SUPABASE_DB_URL (database)');
const dbUrl = process.env.SUPABASE_DB_URL || '';
let parsed = null;
try { parsed = new URL(dbUrl); } catch { /* reported below */ }
if (!parsed) { bad('SUPABASE_DB_URL is empty or not a valid postgresql:// address.'); problems++; }
else {
  console.log(`     host: ${parsed.hostname}  port: ${parsed.port || '5432'}  user: ${parsed.username}`);
  if (/[\[\]]/u.test(dbUrl) || /YOUR-PASSWORD|REPLACE/u.test(dbUrl)) { bad('The password part still contains [YOUR-PASSWORD] or REPLACE. Put your real database password there (no [ ] brackets).'); problems++; }
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 20000 });
  try {
    await client.connect();
    const { rows } = await client.query('select current_database() as db');
    ok(`Connected to the database (${rows[0].db})`);
  } catch (error) {
    problems++;
    const message = `${error.code || ''} ${error.message}`.trim();
    bad(`Database connection failed: ${message}`);
    if (/password authentication failed/iu.test(message)) tip('Wrong database password. If you reset it in Supabase, put the NEW password in SUPABASE_DB_URL. If it has special characters like @ # / ?, reset it to letters and numbers only.');
    else if (/tenant or user not found/iu.test(message)) tip('The host or user does not match your project. Copy the whole string again from Supabase: Connect > Transaction pooler.');
    else if (/timeout|ETIMEDOUT|ECONNREFUSED|ENETUNREACH/iu.test(message)) {
      await probeStages(parsed.hostname, Number(parsed.port || 5432));
      tip('Your network may be blocking port 6543 or 5432 (common on school/office Wi-Fi). Try a phone hotspot, or check that the host was copied exactly from Supabase: Connect > Transaction pooler.');
    }
    else if (/ENOTFOUND|EAI_AGAIN/iu.test(message)) tip('The host name does not exist. Copy the string again from Supabase: Connect > Transaction pooler.');
    else if (/paused|not found/iu.test(message)) tip('Your Supabase project may be paused. Open the Supabase dashboard and click Restore/Resume.');
  } finally { await client.end().catch(() => {}); }
}

// Times each stage of a database connection to show where it stops.
async function probeStages(host, port) {
  console.log('\n     Step-by-step connection test:');
  const step = (label, work, ms = 10000) => {
    const started = Date.now();
    return Promise.race([work(), new Promise((_, reject) => setTimeout(() => reject(new Error(`no answer after ${ms / 1000}s`)), ms))])
      .then(value => { console.log(`     ✅ ${label} (${Date.now() - started} ms)`); return value; })
      .catch(error => { console.log(`     ❌ ${label}: ${error.code || ''} ${error.message}`); return null; });
  };
  const socket = await step(`A. Open connection to ${host}:${port}`, () => new Promise((resolve, reject) => {
    const s = net.connect({ host, port }); s.once('connect', () => resolve(s)); s.once('error', reject);
  }));
  if (!socket) { tip('Stopped at A: the network blocks this port. Try another network.'); return; }
  const answer = await step('B. Database server greets back', () => new Promise((resolve, reject) => {
    socket.once('data', data => resolve(String.fromCharCode(data[0])));
    socket.once('error', reject);
    const request = Buffer.alloc(8); request.writeInt32BE(8, 0); request.writeInt32BE(80877103, 4);
    socket.write(request);
  }));
  if (!answer) {
    socket.destroy();
    tip('Stopped at B: the connection opens but nothing comes back. Something on this computer or network is holding database traffic:');
    tip('antivirus/firewall (Avast, AVG, Kaspersky, Norton, McAfee, ESET, Bitdefender), a VPN, or the router/mobile carrier.');
    tip('Try: pause the antivirus for 10 minutes, turn off any VPN, or use a different Wi-Fi network.');
    return;
  }
  console.log(`        (server answered "${answer}" ${answer === 'S' ? '= encryption supported' : ''})`);
  const secure = await step('C. Encrypted (TLS) handshake', () => new Promise((resolve, reject) => {
    const t = tls.connect({ socket, servername: host, rejectUnauthorized: false }, () => resolve(t)); t.once('error', reject);
  }));
  if (secure) secure.destroy(); else socket.destroy();
  if (!secure) { tip('Stopped at C: encryption is being blocked or inspected, usually by antivirus "HTTPS/SSL scanning". Turn that off or pause the antivirus.'); return; }
  tip('A, B and C all work, so the network is fine. The project, user name or password in SUPABASE_DB_URL is wrong: copy the string again from Supabase > Connect > Transaction pooler.');
}

console.log(problems ? `\n${problems} problem(s) found. Fix them in .env, then restart the API (Ctrl+C, npm start).\n` : '\nEverything is connected. ✅\n');
process.exit(problems ? 1 : 0);
