// Shared settings for every k6 script.
// Change the target with:  k6 run -e BASE_URL=http://localhost:5000 tests/load/load.js
export const BASE_URL = __ENV.BASE_URL || 'http://localhost:5000';

// These pages are NOT behind the API rate limiter, so they measure raw server speed.
// Everything under /api/ allows 300 requests/minute per IP and /daas/ allows 60,
// so a load test from one computer on those paths would mostly get 429 answers.
export const UNLIMITED_PAGES = ['/', '/developer', '/style.css'];

export const DEFAULT_THRESHOLDS = {
  http_req_failed: ['rate<0.01'],                  // less than 1% errors
  http_req_duration: ['p(95)<500', 'p(99)<1500'],  // 95% under 0.5 s, 99% under 1.5 s
  checks: ['rate>0.99'],
};
