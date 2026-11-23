# Testing guide (Windows Command Prompt)

All commands run from the project folder, for example:

```
cd "C:\Users\<you>\Documents\Inventacapstone\InventaAPI"
```

Get the files once with `git pull` and `npm install`.

| Kind of test | Tool | Files | Command |
|---|---|---|---|
| Unit | Jest | `tests/jest/` | `npm run test:jest` |
| Load / stress / spike | k6 + Grafana | `tests/load/` | `k6 run tests/load/load.js` |
| Compatibility | Playwright | `tests/compatibility/` | `npm run test:compat` |
| Statistical | Node script | `scripts/stats/` | `npm run stats:k6 -- <file>` |

Results are saved in `test-results/` (not uploaded to GitHub). Create that folder once
before the first k6 run, or k6 says "The system cannot find the path specified":

```
mkdir test-results
```

---

## 1. Unit testing (Jest)

```
npm run test:jest
npm run test:jest:coverage
```

Coverage report: open `test-results\coverage\lcov-report\index.html`.

Tested: product rules (SKU, segments, visibility), API key security, plan limits,
payment catalog, the IP rate limiter (real HTTP requests) and the statistics math.

> Plain `npx jest` would also pick up the older tests, which are written for
> Node's own test runner and show "must contain at least one test". Always use
> `npm run test:jest`. The older tests still run with their own scripts, e.g.
> `npm run test:rate-limit`.

## 2. Load testing (k6 + Grafana)

Install k6 once: `winget install k6 --source winget`, then reopen Command Prompt.
Start the API first in another window: `npm start`.

| Script | What it does | Time |
|---|---|---|
| `smoke.js` | 1 user, checks everything works | 30 s |
| `load.js` | normal traffic, 20 users | 4 min |
| `stress.js` | 50 → 100 → 200 users, finds the breaking point | 10 min |
| `spike.js` | sudden jump to 150 users, checks recovery | 3 min |
| `rate-limit.js` | 400 quick requests, max 300 per minute should pass | < 1 min |
| `daas-catalog.js` | real `/daas/v1/catalog` with your API key (uses quota) | 2 min (40 requests) |

```
k6 run tests/load/smoke.js
k6 run --out json=test-results/load.json tests/load/load.js
k6 run tests/load/rate-limit.js
k6 run -e API_KEY=daas_v2_xxxx tests/load/daas-catalog.js
```

Note: `/api/...` allows 300 requests per minute per IP and `/daas/...` allows 60, so
the load, stress and spike scripts test the pages without that limit (`/`,
`/developer`, `/style.css`). The limiter itself is checked by `rate-limit.js`.

### See it live in Grafana

**Option A — no install (k6's built-in Grafana-style dashboard):**
```
set K6_WEB_DASHBOARD=true
set K6_WEB_DASHBOARD_EXPORT=test-results\load-report.html
k6 run tests/load/load.js
```
Open http://localhost:5665 while it runs. The HTML report is saved at the end.

**Option B — real Grafana (needs Docker Desktop):**
```
docker compose -f grafana/docker-compose.yml up -d
k6 run --out influxdb=http://localhost:8086/k6 tests/load/load.js
```
Open http://localhost:3030 → Dashboards → New → Import → type **2587** → Load →
choose data source **k6** → Import. Stop it later with
`docker compose -f grafana/docker-compose.yml down`.

**Option C — Grafana Cloud (free account):** `k6 cloud login --token <token>`,
then `k6 cloud run tests/load/load.js`.

## 3. Compatibility testing (Playwright)

Install the browsers once: `npx playwright install`

Start the API (`npm start`). For the dashboard pages also start the dashboard
(`cd dashboard` then `npm run dev`); without it those tests are skipped.

```
npm run test:compat
npm run test:compat -- --project=firefox
npx playwright show-report test-results/compat-report
```

Browsers and devices: Chrome, Firefox, Safari (WebKit), Microsoft Edge, Pixel 7,
iPhone 14, iPad. Each page is checked for: loads without an error status, is not
blank, has no JavaScript errors, and does not scroll sideways on that screen size.

## 4. Statistical testing

Describe one run (mean, median, standard deviation, p90/p95/p99, 95% confidence interval):
```
k6 run --out json=test-results/load.json tests/load/load.js
npm run stats:k6 -- test-results/load.json
```

Compare two runs (Welch's t-test, p < 0.05 means the difference is real),
e.g. 10 users vs 50 users, or before vs after a code change:
```
k6 run --vus 10 --duration 1m --out json=test-results/run-a.json tests/load/smoke.js
k6 run --vus 50 --duration 1m --out json=test-results/run-b.json tests/load/smoke.js
npm run stats:k6 -- test-results/run-a.json test-results/run-b.json
```
The report is saved to `test-results/statistics-report.json`.

---

## 5. Testing the live (deployed) system instead of localhost

Use this when your computer cannot reach the database (for example a network that
blocks database ports). The live servers on Vercel connect to Supabase themselves,
so only normal HTTPS is needed. Nothing has to run on your computer.

| Part | Live address |
|---|---|
| API | https://api.inventaapi.shop |
| Customer dashboard | https://inventaapi.shop |

PowerShell (in Command Prompt use `set NAME=value` instead of `$env:NAME="value"`):

```
k6 run -e BASE_URL=https://api.inventaapi.shop tests/load/smoke.js
k6 run -e BASE_URL=https://api.inventaapi.shop --out json=test-results/live-load.json tests/load/load.js
npm run stats:k6 -- test-results/live-load.json
k6 run -e BASE_URL=https://api.inventaapi.shop -e API_KEY=daas_v2_xxxx -e REQUESTS=20 --out json=test-results/live-catalog.json tests/load/daas-catalog.js

$env:API_URL="https://api.inventaapi.shop"
$env:DASHBOARD_URL="https://inventaapi.shop"
npm run test:compat
```

Be careful, this is the real system:
- Run only `smoke.js` and `load.js` live. Skip `stress.js` and `spike.js`: 200 users can
  slow the site for real customers and use up the Vercel plan.
- Live response times include internet travel time (tens of milliseconds), so they
  are higher than localhost. Report them separately.
- `rate-limit.js` may let more than 300 through live: each Vercel server instance
  counts separately (the code notes this). That is a finding to report, not a test bug.
