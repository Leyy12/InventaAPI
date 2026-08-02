/**
 * Create a test user via automated signup flow for flicker bug testing
 */

import { chromium } from 'playwright';

const TEST_USER = {
  email: 'flicker-test-debug@example.com',
  password: 'FlickerTest2026!',
  fullName: 'Flicker Test User',
  businessName: 'Flicker Test Business',
  businessSegment: 'Hardware Store'
};

const DASHBOARD_URL = 'http://localhost:3000';

async function createTestUser() {
  console.log('[CREATE USER] Starting automated signup...\n');
  console.log('[CREATE USER] Test credentials:');
  console.log(`  Email: ${TEST_USER.email}`);
  console.log(`  Password: ${TEST_USER.password}\n`);
  
  const browser = await chromium.launch({ 
    headless: false,
    slowMo: 300
  });
  
  const context = await browser.newContext();
  const page = await context.newPage();
  
  try {
    console.log('[CREATE USER] Step 1: Navigate to signup page...');
    await page.goto(`${DASHBOARD_URL}/signup`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(2000);
    
    console.log('[CREATE USER] Step 2: Fill signup form...');
    
    // Fill form fields
    await page.fill('input[type="text"]', TEST_USER.fullName);
    await page.fill('input[type="email"]', TEST_USER.email);
    
    // Find business name and segment fields (check actual signup form structure)
    const businessNameField = page.locator('input[placeholder*="business" i], input[placeholder*="company" i]').first();
    if (await businessNameField.isVisible()) {
      await businessNameField.fill(TEST_USER.businessName);
    }
    
    // Business segment dropdown/select
    const segmentField = page.locator('select, input[list]').first();
    if (await segmentField.isVisible()) {
      await segmentField.selectOption(TEST_USER.businessSegment).catch(() => 
        segmentField.fill(TEST_USER.businessSegment)
      );
    }
    
    // Password fields
    const passwordFields = page.locator('input[type="password"]');
    await passwordFields.nth(0).fill(TEST_USER.password); // Password
    await passwordFields.nth(1).fill(TEST_USER.password); // Confirm Password
    
    console.log('[CREATE USER] Step 3: Submit signup form...');
    await page.click('button[type="submit"]');
    
    // Wait for redirect or success
    console.log('[CREATE USER] Step 4: Waiting for signup completion...');
    
    try {
      // Check if redirected to dashboard or landing
      await page.waitForFunction(() => {
        return window.location.pathname.includes('/dashboard') || 
               window.location.pathname === '/';
      }, { timeout: 10000 });
      
      const finalUrl = page.url();
      console.log('[CREATE USER] ✅ Signup completed!');
      console.log(`[CREATE USER] Redirected to: ${finalUrl}`);
      
      // Check if we're on dashboard (successful signup with immediate access)
      if (finalUrl.includes('/dashboard')) {
        console.log('[CREATE USER] ✅ User has immediate dashboard access!');
      } else {
        console.log('[CREATE USER] ℹ️  User created but redirected to landing (normal for Free plan)');
      }
      
      await page.waitForTimeout(3000);
      
      console.log('\n[CREATE USER] ========== USER CREATED SUCCESSFULLY ==========');
      console.log('[CREATE USER] Credentials for Playwright script:');
      console.log(`  email: '${TEST_USER.email}',`);
      console.log(`  password: '${TEST_USER.password}'`);
      console.log('==========================================================\n');
      
    } catch (e) {
      // Check for error messages
      const bodyText = await page.textContent('body');
      if (bodyText.includes('already') || bodyText.includes('exists')) {
        console.log('[CREATE USER] ⚠️  User already exists!');
        console.log('[CREATE USER] You can still use these credentials:');
        console.log(`  email: '${TEST_USER.email}',`);
        console.log(`  password: '${TEST_USER.password}'`);
      } else if (bodyText.includes('verification') || bodyText.includes('verify')) {
        console.error('[CREATE USER] ❌ Email verification required - this blocks automated testing');
        console.error('[CREATE USER] Signup flow requires email verification before login');
      } else {
        console.error('[CREATE USER] ❌ Signup may have failed or form validation error');
        console.error('[CREATE USER] Page content:', bodyText.substring(0, 500));
      }
      
      await page.screenshot({ path: 'signup-result.png', fullPage: true });
      console.log('[CREATE USER] Screenshot saved to: signup-result.png');
    }
    
    console.log('\n[CREATE USER] Browser will remain open for 5 seconds...');
    await page.waitForTimeout(5000);
    
  } catch (error) {
    console.error('[CREATE USER] ❌ Error:', error.message);
    await page.screenshot({ path: 'signup-error.png', fullPage: true });
    console.log('[CREATE USER] Screenshot saved to: signup-error.png');
  } finally {
    await browser.close();
    console.log('[CREATE USER] Browser closed.');
  }
  
  return TEST_USER;
}

// Run and export credentials
createTestUser().then(credentials => {
  console.log('\n[CREATE USER] Ready for flicker test with these credentials.');
  process.exit(0);
}).catch(error => {
  console.error('Fatal error:', error);
  process.exit(1);
});
