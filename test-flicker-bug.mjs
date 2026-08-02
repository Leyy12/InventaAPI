/**
 * Automated test to reproduce and capture the user data flicker bug
 * Usage: node test-flicker-bug.mjs
 */

import { chromium } from 'playwright';

// Test user credentials - created via automated signup
const TEST_USER = {
  email: 'flicker-test-debug@example.com',
  password: 'FlickerTest2026!'
};

const DASHBOARD_URL = 'http://localhost:3000';

async function testFlickerBug() {
  console.log('[TEST] Starting flicker bug reproduction...\n');
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 300
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Capture all console logs
  const consoleLogs = [];
  page.on('console', msg => {
    const text = msg.text();
    const timestamp = new Date().toISOString();
    
    // Only capture our debug logs
    if (text.includes('[🔍 FLICKER DEBUG]') || text.includes('[🔍 SIDEBAR RENDER]')) {
      const logEntry = `[${timestamp}] ${text}`;
      consoleLogs.push(logEntry);
      console.log(logEntry); // Also print to terminal in real-time
    }
  });
  
  try {
    console.log('[TEST] Step 1: Navigating to dashboard (will redirect if not logged in)...');
    await page.goto(`${DASHBOARD_URL}/dashboard`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    const currentUrl = page.url();
    console.log(`[TEST] Current URL: ${currentUrl}`);
    
    if (currentUrl.includes('/dashboard')) {
      console.log('[TEST] ✅ Already logged in! Proceeding directly to reload test...');
      await page.waitForTimeout(3000);
      
      console.log('\n[TEST] ========== INITIAL STATE CAPTURED ==========');
      if (consoleLogs.length > 0) {
        console.log('[TEST] Console logs from current session:\n');
        consoleLogs.forEach(log => console.log(log));
      }
      consoleLogs.length = 0;
      
      console.log('\n[TEST] ========== TRIGGERING PAGE RELOAD ==========');
      console.log('[TEST] Performing hard refresh...\n');
      
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(5000);
      
      console.log('\n[TEST] ========== RELOAD COMPLETE ==========');
      if (consoleLogs.length > 0) {
        console.log('[TEST] Console logs captured during reload:\n');
        consoleLogs.forEach(log => console.log(log));
        analyzeLog(consoleLogs);
      } else {
        console.log('[TEST] ⚠️  No debug logs captured');
      }
      
      console.log('\n[TEST] Browser will remain open for 10 seconds...');
      await page.waitForTimeout(10000);
      await browser.close();
      return;
    }
    
    console.log('[TEST] Not logged in. Navigating to landing page...');
    await page.goto(DASHBOARD_URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    console.log('[TEST] Step 2: Looking for Login button...');
    const loginBtn = page.locator('button:has-text("Login"), a:has-text("Login"), button:has-text("Sign In")').first();
    
    await loginBtn.click({ timeout: 5000 });
    console.log('[TEST] ✅ Clicked Login button');
    await page.waitForTimeout(1500);
    
    console.log('[TEST] Step 3: Filling login credentials...');
    await page.fill('input[type="email"]', TEST_USER.email);
    await page.fill('input[type="password"]', TEST_USER.password);
    
    console.log('[TEST] Step 4: Submitting login form...');
    await page.click('button[type="submit"]');
    
    console.log('[TEST] Step 5: Waiting for login to complete...');
    await page.waitForTimeout(3000);
    
    // Check if redirected to dashboard or stayed on landing (Free plan behavior)
    const finalUrl = page.url();
    if (finalUrl.includes('/dashboard')) {
      console.log('[TEST] ✅ Redirected to dashboard after login');
    } else {
      console.log('[TEST] ℹ️  Stayed on landing page (normal for Free plan)');
      console.log('[TEST] Manually navigating to dashboard...');
      await page.goto(`${DASHBOARD_URL}/dashboard`, { waitUntil: 'load', timeout: 60000 });
      await page.waitForTimeout(3000);
      console.log('[TEST] ✅ Now on dashboard');
    }
    
    console.log('\n[TEST] ========== INITIAL LOAD COMPLETE ==========');
    if (consoleLogs.length > 0) {
      console.log('[TEST] Console logs from login + initial load:\n');
      consoleLogs.forEach(log => console.log(log));
    }
    consoleLogs.length = 0;
    
    console.log('\n[TEST] ========== TRIGGERING PAGE RELOAD ==========');
    console.log('[TEST] Performing hard refresh (Ctrl+R)...\n');
    
    await page.reload({ waitUntil: 'networkidle' });
    await page.waitForTimeout(5000);
    
    console.log('\n[TEST] ========== RELOAD COMPLETE ==========');
    if (consoleLogs.length === 0) {
      console.log('[TEST] ❌ NO DEBUG LOGS CAPTURED');
    } else {
      console.log('[TEST] Console logs captured during reload:\n');
      consoleLogs.forEach(log => console.log(log));
      analyzeLog(consoleLogs);
    }
    
    console.log('\n[TEST] Browser will remain open for 10 seconds for inspection...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('\n[TEST] ❌ Error during test:', error.message);
    await page.screenshot({ path: 'flicker-test-error.png', fullPage: true });
    console.log('[TEST] Screenshot saved: flicker-test-error.png');
  } finally {
    await browser.close();
    console.log('\n[TEST] Browser closed.');
  }
}

function analyzeLog(consoleLogs) {
  console.log('\n[TEST] ========== ANALYSIS ==========');
  
  const authFires = consoleLogs.filter(l => l.includes('onAuthStateChanged fired')).length;
  const appUserChanges = consoleLogs.filter(l => l.includes('appUser changed')).length;
  const sidebarRenders = consoleLogs.filter(l => l.includes('SIDEBAR RENDER')).length;
  
  console.log(`[TEST] - onAuthStateChanged fired: ${authFires} times`);
  console.log(`[TEST] - appUser state changed: ${appUserChanges} times`);
  console.log(`[TEST] - Sidebar re-rendered: ${sidebarRenders} times`);
  
  // Check for flicker: appUser goes from exists:true to exists:false
  let flickerDetected = false;
  for (let i = 0; i < consoleLogs.length - 1; i++) {
    if (consoleLogs[i].includes('exists: true') && consoleLogs[i + 1].includes('exists: false')) {
      console.log(`[TEST] 🐛 FLICKER DETECTED between log ${i} and ${i + 1}:`);
      console.log(`     ${consoleLogs[i]}`);
      console.log(`     ${consoleLogs[i + 1]}`);
      flickerDetected = true;
    }
  }
  
  if (!flickerDetected) {
    console.log('[TEST] ✅ No data → null flicker pattern detected');
  }
  
  if (authFires > 1) {
    console.log('[TEST] ⚠️  onAuthStateChanged fired MULTIPLE times (potential cause of flicker)');
  }
  
  if (authFires === 0) {
    console.log('[TEST] ⚠️  onAuthStateChanged did NOT fire (unusual - auth might not be re-initializing)');
  }
}

testFlickerBug().catch(console.error);
