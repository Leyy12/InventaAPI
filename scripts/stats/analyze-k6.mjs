// Statistical analysis of k6 raw results.
//
//   Describe one run:   node scripts/stats/analyze-k6.mjs test-results/load.json
//   Compare two runs:   node scripts/stats/analyze-k6.mjs before.json after.json
//
// Create the input with:  k6 run --out json=test-results/load.json tests/load/load.js
import { createReadStream, writeFileSync, mkdirSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { basename } from 'node:path';
import { describe, welchTTest } from './statistics.mjs';

async function readRun(file) {
  const durations = [];
  let failed = 0;
  let total = 0;
  const lines = createInterface({ input: createReadStream(file), crlfDelay: Infinity });
  for await (const line of lines) {
    if (!line.includes('"Point"')) continue;
    const row = JSON.parse(line);
    if (row.metric === 'http_req_duration') durations.push(row.data.value);
    if (row.metric === 'http_req_failed') { total += 1; failed += row.data.value; }
  }
  if (!durations.length) throw new Error(`${file} has no http_req_duration points. Run k6 with --out json=<file>.`);
  return { file, durations, errorRate: total ? failed / total : 0 };
}

const fmt = n => (Number.isFinite(n) ? n.toFixed(2) : 'n/a');
function printRun(run) {
  const s = describe(run.durations);
  console.log(`\n=== ${basename(run.file)} (response time, ms) ===`);
  console.table({
    Requests: s.count, 'Error rate %': fmt(run.errorRate * 100), Mean: fmt(s.mean), Median: fmt(s.median),
    'Std dev': fmt(s.stdDev), Min: fmt(s.min), Max: fmt(s.max), p90: fmt(s.p90), p95: fmt(s.p95), p99: fmt(s.p99),
    '95% CI of mean': `${fmt(s.ci95Lower)} – ${fmt(s.ci95Upper)}`, 'Coeff. of variation': fmt(s.coefficientOfVariation),
  });
  return s;
}

const files = process.argv.slice(2);
if (!files.length || files.length > 2) {
  console.error('Usage: node scripts/stats/analyze-k6.mjs <run.json> [other-run.json]');
  process.exit(1);
}
const runs = await Promise.all(files.map(readRun));
const report = { runs: runs.map(run => ({ file: run.file, errorRate: run.errorRate, ...printRun(run) })) };

if (runs.length === 2) {
  const result = welchTTest(runs[0].durations, runs[1].durations);
  report.welchTTest = result;
  console.log("\n=== Welch's t-test (is the mean response time different?) ===");
  console.log(`t = ${fmt(result.t)}, df = ${fmt(result.df)}, p = ${result.p.toExponential(3)}`);
  console.log(result.significant
    ? 'Result: the difference IS statistically significant (p < 0.05).'
    : 'Result: no statistically significant difference (p >= 0.05).');
}

mkdirSync('test-results', { recursive: true });
writeFileSync('test-results/statistics-report.json', JSON.stringify(report, null, 2));
console.log('\nSaved: test-results/statistics-report.json');
