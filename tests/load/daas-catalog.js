// REAL ENDPOINT TEST: measures GET /daas/v1/catalog with your API key.
//
//   k6 run -e API_KEY=daas_v2_xxx tests/load/daas-catalog.js
//   k6 run -e API_KEY=daas_v2_xxx -e REQUESTS=30 tests/load/daas-catalog.js
//
// Paced at one request every 3 seconds because:
//  - /daas/ allows 60 requests per minute per IP, and
//  - the server answers an identical request made within 2 seconds with a saved copy
//    of the first answer (X-Inventa-Repeat: reused). That copy skips the database, so
//    it would make the measured times look faster than they really are.
// NOTE: every request uses part of that key's plan quota (paid plans count every
// product variant delivered). Start small with -e REQUESTS=20.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL } from './config.js';

if (!__ENV.API_KEY) throw new Error('Set your key: k6 run -e API_KEY=daas_v2_... tests/load/daas-catalog.js');
const REQUESTS = Number(__ENV.REQUESTS || 40);
const reused = new Counter('saved_copy_answers');

export const options = {
  scenarios: {
    paced: {
      executor: 'constant-arrival-rate', rate: 1, timeUnit: '3s',
      duration: `${REQUESTS * 3}s`, preAllocatedVUs: 3,
    },
  },
  thresholds: {
    http_req_failed: ['rate<0.01'],
    http_req_duration: ['p(95)<1500'],
    saved_copy_answers: ['count==0'],
  },
};

export default function () {
  const res = http.get(`${BASE_URL}/daas/v1/catalog`, { headers: { 'x-api-key': __ENV.API_KEY }, tags: { name: 'catalog' } });
  if (res.headers['X-Inventa-Repeat'] === 'reused') reused.add(1);
  check(res, {
    'status is 200': r => r.status === 200,
    'body is JSON': r => { try { r.json(); return true; } catch { return false; } },
  });
}
