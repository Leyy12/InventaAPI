// SMOKE TEST: 1 user for 30 seconds. Checks that everything works before bigger tests.
import { DEFAULT_THRESHOLDS } from './config.js';
import { visitPages } from './requests.js';

export const options = {
  vus: 1,
  duration: '30s',
  thresholds: DEFAULT_THRESHOLDS,
};

export default visitPages;
