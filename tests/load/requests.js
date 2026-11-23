import http from 'k6/http';
import { check, sleep } from 'k6';
import { BASE_URL, UNLIMITED_PAGES } from './config.js';

// One "user visit": open every page once, then think for about a second.
export function visitPages() {
  for (const path of UNLIMITED_PAGES) {
    const res = http.get(`${BASE_URL}${path}`, { tags: { name: path } });
    check(res, {
      [`${path} status is 200`]: r => r.status === 200,
      [`${path} answered in < 1s`]: r => r.timings.duration < 1000,
    });
  }
  sleep(Math.random() * 0.5 + 0.75);
}
