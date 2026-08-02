/**
 * Extended test to capture delayed revert pattern
 * Waits 15 seconds after reload to see if data reverts
 */

import { chromium } from 'playwright';

const TEST_USER = {
  email: 'flicker-test-debug@example.com',
  password: 'FlickerTest2026!'
};

const DASHBOARD_URL = 'http://localhost:3000';

async function testDelayedRevert() {
  console.log('🔍 TESTING FOR DELAYED REVERT PATTERN\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 100
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[🔍 FLICKER DEBUG]') || text.includes('[🔍 SIDEBAR RENDER]') || text.includes('[AUTH DEBUG]')) {
      const timestamp = new Date().toISOString();
      consoleLogs.push({ timestamp, text, relativeTime: Date.now() });
    }
  });
  
  try {
    // Login
    console.log('→ Logging in...');
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
    
    console.log('→ On dashboard, clearing logs...\n');
    consoleLogs.length = 0;
    const startTime = Date.now();
    
    console.log('→ RELOADING PAGE...\n');
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    
    // Wait 15 seconds and capture everything
    console.log('→ Waiting 15 seconds to capture any delayed changes...\n');
    await page.waitForTimeout(15000);
    
    console.log('═══════════════════════════════════════════════════════');
    console.log('COMPLETE LOG SEQUENCE (with relative timestamps)');
    console.log('═══════════════════════════════════════════════════════\n');
    
    consoleLogs.forEach((log, idx) => {
      const relativeMs = log.relativeTime - startTime;
      const relativeSec = (relativeMs / 1000).toFixed(2);
      
      let marker = '';
      if (log.text.includes('appUser changed')) {
        if (log.text.includes('exists: true')) {
          marker = '✅ DATA SET';
        } else {
          marker = '❌ DATA NULL';
        }
      } else if (log.text.includes('SIDEBAR RENDER')) {
        if (log.text.includes('hasAppUser: true')) {
          const fullName = log.text.match(/fullName: ([^,}]+)/)?.[1];
          marker = `🎨 RENDER (${fullName})`;
        } else {
          marker = '🎨 RENDER (null)';
        }
      } else if (log.text.includes('onAuthStateChanged fired')) {
        marker = '🔥 AUTH FIRED';
      } else if (log.text.includes('onAuthStateChanged listener initialized')) {
        marker = '🔄 LISTENER INIT';
      }
      
      console.log(`[+${relativeSec.padStart(6)}s] ${marker.padEnd(20)} ${log.text.substring(0, 100)}`);
    });
    
    // Analysis
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('ANALYSIS');
    console.log('═══════════════════════════════════════════════════════\n');
    
    const sidebarRenders = consoleLogs.filter(l => l.text.includes('SIDEBAR RENDER'));
    const appUserChanges = consoleLogs.filter(l => l.text.includes('appUser changed'));
    const authFires = consoleLogs.filter(l => l.text.includes('onAuthStateChanged fired'));
    const listenerInits = consoleLogs.filter(l => l.text.includes('listener initialized'));
    
    console.log(`Total logs captured: ${consoleLogs.length}`);
    console.log(`Sidebar renders: ${sidebarRenders.length}`);
    console.log(`appUser state changes: ${appUserChanges.length}`);
    console.log(`Auth listener fires: ${authFires.length}`);
    console.log(`Listener initializations: ${listenerInits.length}`);
    
    // Check for revert
    let revertFound = false;
    for (let i = 0; i < appUserChanges.length - 1; i++) {
      const current = appUserChanges[i];
      const next = appUserChanges[i + 1];
      
      if (current.text.includes('exists: true') && next.text.includes('exists: false')) {
        const timeDiff = ((next.relativeTime - current.relativeTime) / 1000).toFixed(2);
        console.log(`\n🐛 REVERT DETECTED:`);
        console.log(`   Data set at: +${((current.relativeTime - startTime) / 1000).toFixed(2)}s`);
        console.log(`   Reverted at: +${((next.relativeTime - startTime) / 1000).toFixed(2)}s`);
        console.log(`   Time between: ${timeDiff}s`);
        revertFound = true;
      }
    }
    
    if (!revertFound) {
      console.log('\n✅ NO REVERT DETECTED in 15-second window');
    }
    
    // Check final state
    const lastAppUserChange = appUserChanges[appUserChanges.length - 1];
    if (lastAppUserChange) {
      const hasData = lastAppUserChange.text.includes('exists: true');
      console.log(`\nFinal appUser state: ${hasData ? '✅ HAS DATA' : '❌ NULL'}`);
    }
    
    console.log('\n═══════════════════════════════════════════════════════\n');
    console.log('Browser will stay open for manual inspection for 10 seconds...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await page.screenshot({ path: 'delayed-revert-error.png', fullPage: true });
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

testDelayedRevert().catch(console.error);
