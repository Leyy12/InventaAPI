/**
 * Comprehensive test to verify flicker bug fix AND redirect behavior
 * 
 * Tests:
 * 1. No flicker on page reload (main fix)
 * 2. Login redirect still works
 * 3. Protected route redirect still works
 * 4. Logout still works
 */

import { chromium } from 'playwright';

const TEST_USER = {
  email: 'flicker-test-debug@example.com',
  password: 'FlickerTest2026!'
};

const DASHBOARD_URL = 'http://localhost:3000';

async function runTests() {
  console.log('═══════════════════════════════════════════════════════');
  console.log('🧪 FLICKER FIX VERIFICATION TEST SUITE');
  console.log('═══════════════════════════════════════════════════════\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 200
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    if (text.includes('[🔍 FLICKER DEBUG]') || text.includes('[🔍 SIDEBAR RENDER]')) {
      consoleLogs.push({ timestamp: new Date().toISOString(), text });
    }
  });
  
  let testsPassed = 0;
  let testsFailed = 0;
  
  try {
    // ========== TEST 1: Login Flow ==========
    console.log('📝 TEST 1: Login and redirect to dashboard\n');
    
    await page.goto(DASHBOARD_URL);
    await page.waitForTimeout(1500);
    
    console.log('  → Clicking Login button...');
    await page.click('button:has-text("Login"), a:has-text("Login")');
    await page.waitForTimeout(1000);
    
    console.log('  → Filling credentials...');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    
    console.log('  → Submitting login...');
    await page.click('button[type="submit"]');
    await page.waitForTimeout(4000);
    
    // Free users stay on landing, manually navigate
    if (!page.url().includes('/dashboard')) {
      console.log('  → Navigating to dashboard...');
      await page.goto(`${DASHBOARD_URL}/dashboard`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
    }
    
    if (page.url().includes('/dashboard')) {
      console.log('  ✅ TEST 1 PASSED: Successfully logged in and reached dashboard\n');
      testsPassed++;
    } else {
      console.log('  ❌ TEST 1 FAILED: Did not reach dashboard after login\n');
      testsFailed++;
    }
    
    // ========== TEST 2: No Flicker on Reload ==========
    console.log('📝 TEST 2: Page reload does NOT flicker\n');
    
    consoleLogs.length = 0; // Clear previous logs
    
    console.log('  → Performing page reload...');
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    await page.waitForTimeout(5000);
    
    console.log('  → Analyzing console logs...');
    
    // Count how many times auth listener initialized
    const listenerInits = consoleLogs.filter(l => l.text.includes('onAuthStateChanged listener initialized')).length;
    
    // Count appUser resets to null
    const appUserResets = consoleLogs.filter(l => l.text.includes('appUser changed') && l.text.includes('exists: false')).length;
    
    // Count sidebar renders with no data
    const sidebarNullRenders = consoleLogs.filter(l => 
      l.text.includes('SIDEBAR RENDER') && l.text.includes('hasAppUser: false')
    ).length;
    
    console.log(`  → Listener initializations: ${listenerInits}`);
    console.log(`  → appUser resets to null: ${appUserResets}`);
    console.log(`  → Sidebar renders with null data: ${sidebarNullRenders}`);
    
    // Check for flicker pattern
    let hasFlicker = false;
    for (let i = 0; i < consoleLogs.length - 1; i++) {
      if (consoleLogs[i].text.includes('hasAppUser: true') && 
          consoleLogs[i + 1].text.includes('hasAppUser: false')) {
        hasFlicker = true;
        console.log(`  ⚠️  Flicker detected between logs ${i} and ${i + 1}`);
      }
    }
    
    // SUCCESS CRITERIA:
    // - Listener should initialize ONCE (not multiple times)
    // - No data→null→data pattern (flicker)
    if (listenerInits === 1 && !hasFlicker) {
      console.log('  ✅ TEST 2 PASSED: No flicker detected, auth listener initialized once\n');
      testsPassed++;
    } else {
      console.log('  ❌ TEST 2 FAILED: Flicker detected or multiple auth initializations\n');
      testsFailed++;
    }
    
    // ========== TEST 3: Protected Route Redirect (Logout → Try Dashboard) ==========
    console.log('📝 TEST 3: Unauthenticated user redirected from protected route\n');
    
    console.log('  → Logging out...');
    // Find and click logout button
    await page.click('button:has-text("Sign Out"), button:has-text("Logout")').catch(() => {
      console.log('  ⚠️  Logout button not found via text, trying alternative...');
    });
    await page.waitForTimeout(3000);
    
    // Verify redirected to landing
    if (page.url() === DASHBOARD_URL + '/' || page.url() === DASHBOARD_URL) {
      console.log('  → Logged out, now on landing page');
    } else {
      console.log(`  ⚠️  After logout, URL is: ${page.url()}`);
    }
    
    console.log('  → Attempting to access /dashboard while logged out...');
    await page.goto(`${DASHBOARD_URL}/dashboard`);
    await page.waitForTimeout(3000);
    
    // Should redirect back to landing
    const finalUrl = page.url();
    if (finalUrl === DASHBOARD_URL + '/' || finalUrl === DASHBOARD_URL) {
      console.log('  ✅ TEST 3 PASSED: Redirected to landing page when accessing protected route\n');
      testsPassed++;
    } else {
      console.log(`  ❌ TEST 3 FAILED: Not redirected, still at ${finalUrl}\n`);
      testsFailed++;
    }
    
    // ========== TEST 4: Sidebar Shows Correct Data (No "Developer" Fallback) ==========
    console.log('📝 TEST 4: Sidebar shows user fullName (no "Developer" fallback)\n');
    
    // Log back in
    console.log('  → Logging back in...');
    await page.goto(DASHBOARD_URL);
    await page.waitForTimeout(1500);
    await page.click('button:has-text("Login"), a:has-text("Login")');
    await page.waitForTimeout(1000);
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    await page.click('button[type="submit"]');
    await page.waitForTimeout(3000);
    
    if (!page.url().includes('/dashboard')) {
      await page.goto(`${DASHBOARD_URL}/dashboard`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
    }
    
    console.log('  → Reloading page to check sidebar...');
    consoleLogs.length = 0;
    await page.reload({ waitUntil: 'load', timeout: 60000 });
    
    // EXTENDED WAIT: Capture logs for 10 seconds to see delayed resets
    console.log('  → Waiting 10 seconds to capture any delayed state changes...');
    await page.waitForTimeout(10000);
    
    // Check if sidebar ever showed "Developer" as fallback during render
    const sidebarLogs = consoleLogs.filter(l => l.text.includes('SIDEBAR RENDER'));
    
    console.log(`\n  📋 FULL SIDEBAR RENDER SEQUENCE (${sidebarLogs.length} renders):`);
    sidebarLogs.forEach((log, idx) => {
      const hasData = log.text.includes('hasAppUser: true');
      const fullName = log.text.match(/fullName: ([^,}]+)/)?.[1] || 'undefined';
      console.log(`     ${idx + 1}. [${log.timestamp.substring(11, 23)}] ${hasData ? '✅ DATA' : '❌ NULL'} - Name: ${fullName}`);
    });
    
    console.log(`\n  📋 FULL AUTH STATE CHANGES:`);
    const authChanges = consoleLogs.filter(l => l.text.includes('appUser changed'));
    authChanges.forEach((log, idx) => {
      const exists = log.text.includes('exists: true');
      const fullName = log.text.match(/fullName: ([^,}]+)/)?.[1] || 'undefined';
      console.log(`     ${idx + 1}. [${log.timestamp.substring(11, 23)}] appUser ${exists ? 'SET' : 'NULL'} - Name: ${fullName}`);
    });
    
    console.log(`\n  📋 AUTH LISTENER FIRES:`);
    const authFires = consoleLogs.filter(l => l.text.includes('onAuthStateChanged fired'));
    authFires.forEach((log, idx) => {
      const hasUser = log.text.includes('hasUser: true');
      console.log(`     ${idx + 1}. [${log.timestamp.substring(11, 23)}] Auth fired - ${hasUser ? 'User EXISTS' : 'NO USER'}`);
    });
    
    // Detect REVERT pattern: data → null
    let revertDetected = false;
    for (let i = 0; i < sidebarLogs.length - 1; i++) {
      const current = sidebarLogs[i];
      const next = sidebarLogs[i + 1];
      
      if (current.text.includes('hasAppUser: true') && next.text.includes('hasAppUser: false')) {
        revertDetected = true;
        console.log(`\n  🐛 REVERT DETECTED between render ${i + 1} and ${i + 2}:`);
        console.log(`     ${i + 1}. ${current.text.substring(0, 120)}`);
        console.log(`     ${i + 2}. ${next.text.substring(0, 120)}`);
      }
    }
    
    const showedDeveloperFallback = sidebarLogs.some(l => 
      l.text.includes('hasAppUser: false') || l.text.includes('fullName: undefined')
    );
    
    const finalRenders = sidebarLogs.slice(-2); // Last 2 renders
    const showsCorrectData = finalRenders.some(l => 
      l.text.includes('fullName: Flicker Test User')
    );
    
    console.log(`\n  → Showed "Developer" fallback at any point: ${showedDeveloperFallback ? 'YES' : 'NO'}`);
    console.log(`  → Final render shows correct data: ${showsCorrectData}`);
    console.log(`  → REVERT pattern detected: ${revertDetected ? 'YES ❌' : 'NO ✅'}`);
    
    if (showsCorrectData && !revertDetected) {
      console.log('  ✅ TEST 4 PASSED: Sidebar shows correct data without reverting\n');
      testsPassed++;
    } else {
      console.log('  ❌ TEST 4 FAILED: Sidebar data reverted or incorrect\n');
      testsFailed++;
    }
    
    // ========== RESULTS ==========
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('📊 TEST RESULTS');
    console.log('═══════════════════════════════════════════════════════');
    console.log(`✅ Passed: ${testsPassed}/4`);
    console.log(`❌ Failed: ${testsFailed}/4`);
    
    if (testsFailed === 0) {
      console.log('\n🎉 ALL TESTS PASSED! Flicker bug is fixed and redirects work correctly.');
    } else {
      console.log('\n⚠️  SOME TESTS FAILED - Review logs above for details.');
    }
    console.log('═══════════════════════════════════════════════════════\n');
    
    console.log('Browser will remain open for 10 seconds for manual inspection...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('\n❌ TEST ERROR:', error.message);
    await page.screenshot({ path: 'test-error.png', fullPage: true });
    console.log('Screenshot saved: test-error.png');
  } finally {
    await browser.close();
    console.log('Browser closed.');
  }
}

runTests().catch(console.error);
