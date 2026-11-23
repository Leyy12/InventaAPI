// REAL ENDPOINT TEST: measures /daas/v1/catalog with your API key, staying under
// the 60-per-minute limit (50 requests per minute for 3 minutes).
// NOTE: every successful call uses part of that key's plan quota.
//
//   k6 run -e API_KEY=daas_v2_xxx tests/load/daas-catalog.js
import http from 'k6/http';
import { check } from 'k6';
import { BASE_URL } from './config.js';

if (!__ENV.API_KEY) throw new Error('Set your key: k6 run -e API_KEY=daas_v2_... tests/load/daas-catalog.js');

export const options = {
  scenarios: {
    steady: { executor: 'constant-arrival-rate', rate: 50, timeUnit: '1m', duration: '3m', preAllocatedVUs: 5 },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/daas/v1/catalog`, { headers: { 'x-api-key': __ENV.API_KEY }, tags: { name: 'catalog' } });
  check(res, {
    'status is 200': r => r.status === 200,
    'body is JSON': r => { try { r.json(); return true; } catch { return false; } },
  });
}
