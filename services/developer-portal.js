import { readFileSync } from 'node:fs';
import { validReleaseOrigin } from '../scripts/validate-release-config.mjs';

// public/index.html sends visitors to the Customer dashboard. The file holds the
// local address; each environment swaps in its own DASHBOARD_URL so the deployed
// API never sends real visitors to a developer's localhost.
const LOCAL_DASHBOARD = 'http://localhost:3000';
const PLACEHOLDER = `${LOCAL_DASHBOARD}/`;

export function dashboardOrigin(value) {
  const trimmed = typeof value === 'string' ? value.trim().replace(/\/+$/u, '') : '';
  return trimmed && validReleaseOrigin(trimmed, 'test') ? trimmed : LOCAL_DASHBOARD;
}

export function renderDeveloperPortal(html, origin) {
  return html.split(PLACEHOLDER).join(`${dashboardOrigin(origin)}/`);
}

export function createDeveloperPortalHandler(htmlPath, origin = process.env.DASHBOARD_URL) {
  const page = renderDeveloperPortal(readFileSync(htmlPath, 'utf8'), origin);
  return (_req, res) => res.type('html').send(page);
}
