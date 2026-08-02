/**
 * Test multiple reloads on a PRE-EXISTING authenticated session
 * Simulates: user already logged in → refresh → refresh → refresh
 */

import { chromium } from 'playwright';
import { writeFileSync, appendFileSync } from 'fs';

const TEST_USER = {
  email: 'flicker-test-debug@example.com',
  password: 'FlickerTest2026!'
};

const DASHBOARD_URL = 'http://localhost:3000';
const LOG_FILE = 'auth-session-test.log';

// Clear log file
writeFileSync(LOG_FILE, `[TEST START] ${new Date().toISOString()}\n`, 'utf8');

function log(message) {
  const timestamp = new Date().toISOString();
  const entry = `[${timestamp}] ${message}\n`;
  console.log(message);
  appendFileSync(LOG_FILE, entry, 'utf8');
}

async function testPersistentSession() {
  log('═══════════════════════════════════════════════════════');
  log('🔍 TESTING PRE-EXISTING SESSION WITH MULTIPLE RELOADS');
  log('═══════════════════════════════════════════════════════\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const consoleLogs = [];
  let reloadCount = 0;
  
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[🔍 FLICKER DEBUG]') || text.includes('[🔍 SIDEBAR RENDER]') || text.includes('[AUTH DEBUG]')) {
      const entry = {
        reload: reloadCount,
        timestamp: new Date().toISOString(),
        relativeMs: Date.now(),
        text
      };
      consoleLogs.push(entry);
    }
  });
  
  try {
    // ========== PHASE 1: INITIAL LOGIN ==========
    log('📝 PHASE 1: Initial login to establish session\n');
    
    await page.goto(DASHBOARD_URL);
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Login")');
    await page.waitForTimeout(1000);
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    
    if (!page.url().includes('/dashboard')) {
      await page.goto(`${DASHBOARD_URL}/dashboard`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
    }
    
    log('✅ Logged in, session established');
    log('⏳ Waiting 5 seconds for session to stabilize...\n');
    await page.waitForTimeout(5000);
    
    consoleLogs.length = 0; // Clear login logs
    
    // ========== PHASE 2: FIRST RELOAD (PRE-EXISTING SESSION) ==========
    log('📝 PHASE 2: RELOAD #1 (pre-existing session)\n');
    reloadCount = 1;
    const reload1Start = Date.now();
    
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    log('→ Reload complete, waiting 5 seconds...');
    await page.waitForTimeout(5000);
    
    const reload1Logs = consoleLogs.filter(l => l.reload === 1);
    log(`→ Captured ${reload1Logs.length} logs`);
    analyzeReloadLogs(reload1Logs, reload1Start, 1);
    
    // ========== PHASE 3: SECOND RELOAD ==========
    log('\n📝 PHASE 3: RELOAD #2 (established session)\n');
    reloadCount = 2;
    const reload2Start = Date.now();
    
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    log('→ Reload complete, waiting 5 seconds...');
    await page.waitForTimeout(5000);
    
    const reload2Logs = consoleLogs.filter(l => l.reload === 2);
    log(`→ Captured ${reload2Logs.length} logs`);
    analyzeReloadLogs(reload2Logs, reload2Start, 2);
    
    // ========== PHASE 4: THIRD RELOAD ==========
    log('\n📝 PHASE 4: RELOAD #3 (established session)\n');
    reloadCount = 3;
    const reload3Start = Date.now();
    
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    log('→ Reload complete, waiting 10 seconds (extended)...');
    await page.waitForTimeout(10000);
    
    const reload3Logs = consoleLogs.filter(l => l.reload === 3);
    log(`→ Captured ${reload3Logs.length} logs`);
    analyzeReloadLogs(reload3Logs, reload3Start, 3);
    
    // ========== FINAL ANALYSIS ==========
    log('\n═══════════════════════════════════════════════════════');
    log('📊 OVERALL ANALYSIS');
    log('═══════════════════════════════════════════════════════\n');
    
    const allReverts = [];
    [reload1Logs, reload2Logs, reload3Logs].forEach((logs, idx) => {
      const revertFound = detectRevert(logs);
      if (revertFound) {
        allReverts.push(`Reload #${idx + 1}`);
      }
    });
    
    if (allReverts.length > 0) {
      log(`🐛 REVERT DETECTED in: ${allReverts.join(', ')}`);
    } else {
      log('✅ NO REVERT detected across 3 consecutive reloads');
    }
    
    log(`\nDetailed logs saved to: ${LOG_FILE}`);
    log('═══════════════════════════════════════════════════════\n');
    
    log('Browser will stay open for 10 seconds...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`);
    await page.screenshot({ path: 'persistent-session-error.png', fullPage: true });
  } finally {
    await browser.close();
    log('Browser closed.');
  }
}

function analyzeReloadLogs(logs, startTime, reloadNum) {
  const sidebarRenders = logs.filter(l => l.text.includes('SIDEBAR RENDER'));
  const appUserChanges = logs.filter(l => l.text.includes('appUser changed'));
  const authFires = logs.filter(l => l.text.includes('onAuthStateChanged fired'));
  
  log(`  Sidebar renders: ${sidebarRenders.length}`);
  log(`  appUser changes: ${appUserChanges.length}`);
  log(`  Auth fires: ${authFires.length}`);
  
  // Check for revert pattern
  const revertFound = detectRevert(logs);
  if (revertFound) {
    log(`  🐛 REVERT PATTERN DETECTED!`);
  } else {
    log(`  ✅ No revert pattern`);
  }
  
  // Show timeline
  log(`\n  Timeline (relative to reload start):`);
  logs.slice(0, 15).forEach(entry => { // Show first 15 logs
    const relativeMs = entry.relativeMs - startTime;
    const relativeSec = (relativeMs / 1000).toFixed(2);
    
    let marker = '';
    if (entry.text.includes('appUser changed: {timestamp:')) {
      marker = entry.text.includes('exists: true') ? '✅ DATA' : '❌ NULL';
    } else if (entry.text.includes('SIDEBAR RENDER @ ')) {
      marker = entry.text.includes('hasAppUser: true') ? '🎨 DATA' : '🎨 NULL';
    }
    
    const preview = entry.text.substring(0, 80);
    log(`    +${relativeSec.padStart(5)}s ${marker.padEnd(8)} ${preview}`);
  });
}

function detectRevert(logs) {
  const appUserChanges = logs.filter(l => l.text.includes('appUser changed'));
  
  for (let i = 0; i < appUserChanges.length - 1; i++) {
    const current = appUserChanges[i];
    const next = appUserChanges[i + 1];
    
    if (current.text.includes('exists: true') && next.text.includes('exists: false')) {
      return true;
    }
  }
  
  return false;
}

testPersistentSession().catch(error => {
  log(`FATAL ERROR: ${error.message}`);
  console.error(error);
});
