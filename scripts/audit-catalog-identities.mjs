// Local JSON or explicitly selected localhost demo emulator. Never loads SDK/env.
import { readFileSync } from 'node:fs';
import { auditCatalog } from '../services/catalog-audit.js';
import { readEmulatorCatalog } from './catalog-audit-emulator.mjs';

const args = process.argv.slice(2);
const local = args.length === 1 && args[0].toLowerCase().endsWith('.json');
const emulator = args.length === 4 && args[0] === '--emulator' && args[2] === '--project';
if (!local && !emulator) {
  console.error('Usage: node scripts/audit-catalog-identities.mjs <local-catalog.json> OR --emulator 127.0.0.1:PORT --project demo-ID');
  process.exitCode = 2;
} else {
  try {
    const input = local ? JSON.parse(readFileSync(args[0], 'utf8')) : await readEmulatorCatalog(args[1], args[3]);
    if (!Array.isArray(input.products) || (input.reservations !== undefined && !Array.isArray(input.reservations))) throw new Error('Invalid export shape');
    const report = auditCatalog(input.products, input.reservations);
    console.log(JSON.stringify(report, null, 2));
    process.exitCode = report.ok ? 0 : 1;
  } catch (error) { console.error('Offline audit failed:', error.message); process.exitCode = 2; }
}
