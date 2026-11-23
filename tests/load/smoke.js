// SMOKE TEST: 1 user for 30 seconds. Checks that everything works before bigger tests.
import { DEFAULT_THRESHOLDS, CLOUD_OPTIONS } from './config.js';
import { visitPages } from './requests.js';

export const options = {
  cloud: CLOUD_OPTIONS,
  vus: 1,
  duration: '30s',
  thresholds: DEFAULT_THRESHOLDS,
};

export default visitPages;
