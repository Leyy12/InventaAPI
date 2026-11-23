// RATE LIMIT TEST: sends 400 requests to /api within a minute from one IP.
// The server allows 300 per minute, so about 300 should succeed and the rest get 429.
// Passing this test means the DoS protection works.
import http from 'k6/http';
import { check } from 'k6';
import { Counter } from 'k6/metrics';
import { BASE_URL } from './config.js';

const allowed = new Counter('requests_allowed');
const blocked = new Counter('requests_blocked_429');

export const options = {
  scenarios: {
    burst: { executor: 'shared-iterations', vus: 10, iterations: 400, maxDuration: '50s' },
  },
  thresholds: {
    requests_blocked_429: ['count>0'],       // the limiter must kick in
    requests_allowed: ['count<=300'],        // and never let more than 300 through
    checks: ['rate==1.0'],
  },
};

export default function () {
  // 429 is an expected answer here, so do not count it as a failed request.
  const res = http.get(`${BASE_URL}/api`, { responseCallback: http.expectedStatuses(200, 429) });
  if (res.status === 200) allowed.add(1);
  if (res.status === 429) blocked.add(1);
  check(res, { 'status is 200 or 429': r => r.status === 200 || r.status === 429 });
}
