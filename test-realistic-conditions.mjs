/**
 * Realistic browser conditions test
 * - Visible browser (non-headless)
 * - Random delays (1-30s) between actions
 * - Extended idle periods (2-3 minutes)
 * - Network throttling (slow 3G)
 */

import { chromium } from 'playwright';

const TEST_USER = {
  email: 'flicker-test-debug@example.com',
  password: 'FlickerTest2026!'
};

const DASHBOARD_URL = 'http://localhost:3000';

// Helper: random delay between min and max seconds
const randomDelay = (minSec, maxSec) => {
  const ms = (Math.random() * (maxSec - minSec) + minSec) * 1000;
  return Math.floor(ms);
};

function log(message) {
  console.log(`[${new Date().toISOString().substring(11, 23)}] ${message}`);
}

async function testRealisticConditions() {
  log('═══════════════════════════════════════════════════════');
  log('🌐 REALISTIC BROWSER CONDITIONS TEST');
  log('═══════════════════════════════════════════════════════\n');
  
  // NON-HEADLESS visible browser
  const browser = await chromium.launch({ 
    headless: false,  // Real visible window
    slowMo: 50
  });
  
  const context = await browser.newContext({
    // Slow 3G network throttling
    offline: false,
    downloadThroughput: (50 * 1024) / 8,  // 50kb/s download
    uploadThroughput: (20 * 1024) / 8,    // 20kb/s upload
    latency: 2000                          // 2000ms latency
  });
  
  const page = await context.newPage();
  
  const allLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[🔍 FLICKER DEBUG]') || text.includes('[📝')) {
      const entry = {
        timestamp: new Date().toISOString(),
        text: text.substring(0, 150)
      };
      allLogs.push(entry);
    }
  });
  
  log('✓ Browser launched (visible, slow 3G network)\n');
  
  try {
    // ========== LOGIN ==========
    log('PHASE 1: Logging in...');
    await page.goto(DASHBOARD_URL);
    
    const delay1 = randomDelay(2, 5);
    log(`→ Waiting ${(delay1/1000).toFixed(1)}s (realistic page read time)...`);
    await page.waitForTimeout(delay1);
    
    await page.click('button:has-text("Login")');
    await page.waitForTimeout(randomDelay(1, 2));
    
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.waitForTimeout(randomDelay(0.5, 1));
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.waitForTimeout(randomDelay(0.5, 1));
    
    await page.click('button[type="submit"]');
    log('→ Login submitted, waiting for auth...');
    await page.waitForTimeout(5000);
    
    if (!page.url().includes('/dashboard')) {
      await page.goto(`${DASHBOARD_URL}/dashboard`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
    }
    
    log('✓ Logged in and on dashboard\n');
    
    // ========== REALISTIC BROWSING PATTERN ==========
    log('PHASE 2: Simulating normal browsing (random delays)...');
    
    allLogs.length = 0; // Clear login logs
    
    // Reload 1 - after short delay
    const delay2 = randomDelay(5, 10);
    log(`→ Waiting ${(delay2/1000).toFixed(1)}s before first reload...`);
    await page.waitForTimeout(delay2);
    
    log('→ RELOAD #1');
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    
    const delay3 = randomDelay(3, 8);
    log(`→ Observing for ${(delay3/1000).toFixed(1)}s...`);
    await page.waitForTimeout(delay3);
    
    const reload1Logs = [...allLogs];
    log(`  Captured ${reload1Logs.length} logs`);
    checkForRevert(reload1Logs, 'RELOAD #1');
    
    // Reload 2 - after longer delay
    const delay4 = randomDelay(10, 20);
    log(`\n→ Waiting ${(delay4/1000).toFixed(1)}s before second reload...`);
    await page.waitForTimeout(delay4);
    
    allLogs.length = 0;
    log('→ RELOAD #2');
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    
    const delay5 = randomDelay(5, 10);
    log(`→ Observing for ${(delay5/1000).toFixed(1)}s...`);
    await page.waitForTimeout(delay5);
    
    const reload2Logs = allLogs.filter(l => !reload1Logs.includes(l));
    log(`  Captured ${reload2Logs.length} logs`);
    checkForRevert(reload2Logs, 'RELOAD #2');
    
    // ========== EXTENDED IDLE TEST ==========
    log('\nPHASE 3: Extended idle period (2 minutes)...');
    log('→ Leaving page open and idle...');
    
    allLogs.length = 0;
    const idleStart = Date.now();
    
    // Wait 2 minutes, checking every 15 seconds
    for (let i = 0; i < 8; i++) {
      await page.waitForTimeout(15000);
      const elapsed = Math.floor((Date.now() - idleStart) / 1000);
      log(`  ${elapsed}s elapsed... (checking for spontaneous state changes)`);
      
      // Check if any appUser changes happened
      const recentChanges = allLogs.filter(l => l.text.includes('appUser changed'));
      if (recentChanges.length > 0) {
        log(`  ⚠️  Detected ${recentChanges.length} appUser changes during idle!`);
        recentChanges.forEach(entry => {
          log(`    ${entry.timestamp}: ${entry.text}`);
        });
      }
    }
    
    log('→ Idle period complete');
    const idleLogs = [...allLogs];
    log(`  Captured ${idleLogs.length} logs during 2-minute idle`);
    checkForRevert(idleLogs, 'IDLE PERIOD');
    
    // ========== POST-IDLE RELOAD ==========
    log('\nPHASE 4: Reload after idle period...');
    allLogs.length = 0;
    
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    log('→ Observing for 10 seconds...');
    await page.waitForTimeout(10000);
    
    const postIdleLogs = [...allLogs];
    log(`  Captured ${postIdleLogs.length} logs`);
    checkForRevert(postIdleLogs, 'POST-IDLE RELOAD');
    
    // ========== FINAL REPORT ==========
    log('\n═══════════════════════════════════════════════════════');
    log('📊 TEST COMPLETE');
    log('═══════════════════════════════════════════════════════');
    log(`Total test duration: ${Math.floor((Date.now() - idleStart + 30000) / 1000 / 60)} minutes`);
    log(`Total logs captured: ${reload1Logs.length + reload2Logs.length + idleLogs.length + postIdleLogs.length}`);
    log('═══════════════════════════════════════════════════════\n');
    
    log('Browser will stay open for manual inspection (30 seconds)...');
    await page.waitForTimeout(30000);
    
  } catch (error) {
    log(`\n❌ ERROR: ${error.message}`);
    await page.screenshot({ path: 'realistic-test-error.png', fullPage: true });
  } finally {
    await browser.close();
    log('Browser closed.');
  }
}

function checkForRevert(logs, phase) {
  const appUserChanges = logs.filter(l => l.text.includes('appUser changed'));
  
  if (appUserChanges.length === 0) {
    log(`  ℹ️  No appUser changes detected in ${phase}`);
    return;
  }
  
  log(`  → ${appUserChanges.length} appUser state changes:`);
  appUserChanges.forEach((entry, idx) => {
    const hasData = entry.text.includes('exists: true');
    const status = hasData ? '✅ DATA' : '❌ NULL';
    log(`    ${idx + 1}. [${entry.timestamp.substring(11, 23)}] ${status}`);
  });
  
  // Check for revert pattern
  for (let i = 0; i < appUserChanges.length - 1; i++) {
    const current = appUserChanges[i];
    const next = appUserChanges[i + 1];
    
    if (current.text.includes('exists: true') && next.text.includes('exists: false')) {
      log(`  🐛 REVERT DETECTED in ${phase}!`);
      log(`     ${current.timestamp}: DATA SET`);
      log(`     ${next.timestamp}: REVERTED TO NULL`);
      return true;
    }
  }
  
  log(`  ✅ No revert pattern in ${phase}`);
  return false;
}

testRealisticConditions().catch(error => {
  console.error('FATAL ERROR:', error);
});
