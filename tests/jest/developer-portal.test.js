import { describe, test, expect } from '@jest/globals';
import { dashboardOrigin, renderDeveloperPortal } from '../../services/developer-portal.js';

const page = `<script>window.location.href = 'http://localhost:3000/';</script><a href="http://localhost:3000/">click here</a>`;

describe('developer portal redirect target', () => {
  test('deployed API sends visitors to its own dashboard', () => {
    const html = renderDeveloperPortal(page, 'https://inventa-dashboard-tau.vercel.app');
    expect(html).not.toContain('localhost');
    expect(html.match(/https:\/\/inventa-dashboard-tau\.vercel\.app\//g)).toHaveLength(2);
  });
  test('trailing slash in DASHBOARD_URL is accepted', () => {
    expect(dashboardOrigin('https://inventaapi.shop/')).toBe('https://inventaapi.shop');
  });
  test.each([undefined, '', 'not a url', 'javascript:alert(1)', "https://x.com/'onload='", 'https://x.com/path'])(
    'unsafe or missing value %p falls back to localhost', value => {
      expect(dashboardOrigin(value)).toBe('http://localhost:3000');
    });
  test('local development keeps localhost:3000', () => {
    expect(renderDeveloperPortal(page, 'http://localhost:3000')).toBe(page);
  });
});
