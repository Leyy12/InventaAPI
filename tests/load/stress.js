// STRESS TEST: keeps adding users to find where the server slows down or fails.
import { CLOUD_OPTIONS } from './config.js';
import { visitPages } from './requests.js';

export const options = {
  cloud: CLOUD_OPTIONS,
  stages: [
    { duration: '1m', target: 50 },
    { duration: '2m', target: 50 },
    { duration: '1m', target: 100 },
    { duration: '2m', target: 100 },
    { duration: '1m', target: 200 },
    { duration: '2m', target: 200 },
    { duration: '1m', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<2000'],
  },
};

export default visitPages;
