// SPIKE TEST: traffic jumps suddenly from 5 to 150 users, then drops. Does the server recover?
import { CLOUD_OPTIONS } from './config.js';
import { visitPages } from './requests.js';

export const options = {
  cloud: CLOUD_OPTIONS,
  stages: [
    { duration: '30s', target: 5 },
    { duration: '10s', target: 150 },  // sudden spike
    { duration: '1m', target: 150 },
    { duration: '10s', target: 5 },    // drop
    { duration: '1m', target: 5 },     // recovery
    { duration: '10s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
  },
};

export default visitPages;
