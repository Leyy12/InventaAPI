// Shared settings for every k6 script.
// Change the target with:  k6 run -e BASE_URL=http://localhost:5000 tests/load/load.js
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// These pages are NOT behind the API rate limiter, so they measure raw server speed.
// Everything under /api/ allows 300 requests/minute per IP and /daas/ allows 60,
// so a load test from one computer on those paths would mostly get 429 answers.
export const UNLIMITED_PAGES = ['/', '/developer', '/style.css'];

// Localhost targets: no internet travel time, so the server alone is measured.
const LOCAL_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],                  // less than 1% errors
  http_req_duration: ['p(95)<500', 'p(99)<1500'],  // 95% under 0.5 s, 99% under 1.5 s
  checks: ['rate>0.99'],
};
// Deployed targets (-e PROFILE=live): include internet travel time and serverless
// cold starts, so 95% must finish within 1 s and 99% within 2 s.
const LIVE_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],
  http_req_duration: ['p(95)<1000', 'p(99)<2000'],
  checks: ['rate>0.95'],
};
export const DEFAULT_THRESHOLDS = __ENV.PROFILE === 'live' ? LIVE_THRESHOLDS : LOCAL_THRESHOLDS;

// Grafana Cloud k6 (k6 cloud run ...): generate the load from Singapore, next to the
// Vercel API (region sin1), so the tester's own internet connection is not measured.
// Ignored by plain "k6 run".
export const CLOUD_OPTIONS = {
  name: __ENV.TEST_NAME || 'InventaAPI load test',
  distribution: { singapore: { loadZone: 'amazon:sg:singapore', percent: 100 } },
};
