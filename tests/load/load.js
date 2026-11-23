// LOAD TEST: normal expected traffic. Ramps up to 20 users, holds, then ramps down.
import { DEFAULT_THRESHOLDS, CLOUD_OPTIONS } from './config.js';
import { visitPages } from './requests.js';

export const options = {
  cloud: CLOUD_OPTIONS,
  stages: [
    { duration: '30s', target: 20 },  // ramp up
    { duration: '3m', target: 20 },   // steady
    { duration: '30s', target: 0 },   // ramp down
  ],
  thresholds: DEFAULT_THRESHOLDS,
};

export default visitPages;
