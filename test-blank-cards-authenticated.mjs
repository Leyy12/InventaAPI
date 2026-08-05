/**
 * CORRECTED DIAGNOSTIC TEST: Check blank cards issue WITH PROPER AUTHENTICATION
 * This test:
 * 1. Logs in with test user credentials
 * 2. Navigates to /dashboard/products AS AN AUTHENTICATED USER
 * 3. Checks if products render or show blank cards
 * 
 * This is the REAL test that matters - matching the user's actual experience.
 */

import { chromium } from 'playwright';

async function diagnoseBlankCardsAuthenticated() {
  console.log('🔍 BLANK CARDS DIAGNOSTIC TEST (AUTHENTICATED SESSION)\n');
  console.log('========================================\n');
  
  const browser = await chromium.launch({ headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();
  
  // Collect console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push({
      type: msg.type(),
      text: msg.text(),
      location: msg.location()
    });
  });
  
  // Collect network failures
  const failedRequests = [];
  page.on('requestfailed', request => {
    failedRequests.push({
      url: request.url(),
      failure: request.failure()?.errorText
    });
  });
  
  try {
    // STEP 1: LOGIN FIRST
    console.log('🔐 STEP 1: LOGGING IN\n');
    console.log('   Navigating to login page...');
    
    await page.goto('http://localhost:3000', {
      waitUntil: 'domcontentloaded',
      timeout: 30000
    });
    
    // Wait for and click the login button in navbar
    console.log('   Waiting for login button...');
    await page.waitForSelector('button:has-text("Sign In"), a:has-text("Sign In"), button:has-text("Login")', { timeout: 10000 });
    
    const loginButton = page.locator('button:has-text("Sign In"), a:has-text("Sign In"), button:has-text("Login")').first();
    await loginButton.click();
    console.log('   ✓ Clicked login button');
    
    // Wait for login modal/form
    await page.waitForTimeout(1000);
    
    // Fill in login credentials (using test user from earlier sessions)
    console.log('   Filling in credentials...');
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i]').first();
    const passwordInput = page.locator('input[type="password"], input[name="password"]').first();
    
    // Test user credentials (from earlier auth debugging)
    await emailInput.fill('test@example.com');
    await passwordInput.fill('testpassword123');
    console.log('   ✓ Credentials entered');
    
    // Submit login form
    const submitButton = page.locator('button[type="submit"]:has-text("Sign In"), button[type="submit"]:has-text("Login"), button:has-text("Sign In")').first();
    await submitButton.click();
    console.log('   ✓ Submitted login form');
    
    // Wait for authentication to complete
    console.log('   Waiting for authentication...');
    await page.waitForTimeout(3000);
    
    // Check if login succeeded by looking for user indicators
    const currentUrl = page.url();
    const bodyText = await page.locator('body').innerText();
    const hasUserMenu = await page.locator('[data-testid="user-menu"], .user-menu, button:has-text("Profile"), button:has-text("Logout")').count() > 0;
    
    console.log(`   Current URL: ${currentUrl}`);
    console.log(`   User menu present: ${hasUserMenu}`);
    
    if (!hasUserMenu && !bodyText.includes('Dashboard')) {
      console.log('   ⚠️  WARNING: Login might have failed - no user menu detected\n');
      console.log('   Attempting to proceed anyway...\n');
    } else {
      console.log('   ✅ Login appears successful\n');
    }
    
    // STEP 2: NAVIGATE TO PRODUCTS PAGE
    console.log('========================================');
    console.log('📱 STEP 2: NAVIGATING TO PRODUCTS PAGE\n');
    console.log('   URL: http://localhost:3000/dashboard/products\n');
    
    await page.goto('http://localhost:3000/dashboard/products', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('   ✅ Page loaded\n');
    
    // Wait for React to render
    await page.waitForTimeout(3000);
    
    // STEP 3: CHECK AUTHENTICATION STATUS ON PRODUCTS PAGE
    console.log('========================================');
    console.log('🔐 STEP 3: VERIFYING AUTHENTICATION STATUS\n');
    
    const sidebarText = await page.locator('aside, [data-testid="sidebar"], nav').first().innerText().catch(() => '');
    const hasUserNameInSidebar = sidebarText.includes('test@example.com') || sidebarText.includes('Developer') || sidebarText.includes('Free') || sidebarText.includes('Starter');
    
    console.log(`   User info in sidebar: ${hasUserNameInSidebar ? '✅ YES' : '❌ NO'}`);
    console.log(`   Sidebar text snippet: ${sidebarText.substring(0, 200).replace(/\n/g, ' ')}\n`);
    
    if (!hasUserNameInSidebar) {
      console.log('   🚨 CRITICAL: User appears to be UNAUTHENTICATED on products page!');
      console.log('   This means the permission error is EXPECTED behavior.\n');
    } else {
      console.log('   ✅ User is AUTHENTICATED - products should be accessible\n');
    }
    
    // STEP 4: CHECK FOR PRODUCT CARDS
    console.log('========================================');
    console.log('🔎 STEP 4: CHECKING DOM CONTENT\n');
    
    const productCards = await page.locator('[data-testid="product-card"], .product-card, article').count();
    console.log(`   Product cards found: ${productCards}\n`);
    
    // Check for loading/error states
    const hasLoadingSpinner = await page.locator('[data-testid="loading"], .loading, .spinner').count() > 0;
    const hasErrorMessage = await page.locator('[data-testid="error"], .error-message').count() > 0;
    const hasEmptyState = await page.locator('[data-testid="empty-state"], .empty-state').count() > 0;
    
    console.log(`   Loading spinner: ${hasLoadingSpinner}`);
    console.log(`   Error message: ${hasErrorMessage}`);
    console.log(`   Empty state: ${hasEmptyState}\n`);
    
    // Capture screenshot
    await page.screenshot({ path: 'diagnostic-screenshot-authenticated.png', fullPage: true });
    console.log('📸 Screenshot saved: diagnostic-screenshot-authenticated.png\n');
    
    // STEP 5: CHECK CONSOLE ERRORS
    console.log('========================================');
    console.log('🐛 STEP 5: CONSOLE MESSAGES\n');
    
    const errors = consoleMessages.filter(m => m.type === 'error');
    const warnings = consoleMessages.filter(m => m.type === 'warning');
    const permissionErrors = errors.filter(e => e.text.toLowerCase().includes('permission') || e.text.toLowerCase().includes('insufficient'));
    
    if (permissionErrors.length > 0) {
      console.log(`   🚨 PERMISSION ERRORS (${permissionErrors.length}):`);
      permissionErrors.forEach((err, i) => {
        console.log(`      ${i + 1}. ${err.text}`);
      });
      console.log('');
    }
    
    if (errors.length > 0) {
      console.log(`   ❌ ALL ERRORS (${errors.length}):`);
      errors.slice(0, 10).forEach((err, i) => {
        console.log(`      ${i + 1}. ${err.text}`);
      });
      if (errors.length > 10) {
        console.log(`      ... and ${errors.length - 10} more errors`);
      }
      console.log('');
    } else {
      console.log('   ✅ No console errors\n');
    }
    
    // STEP 6: FINAL DIAGNOSIS
    console.log('========================================');
    console.log('📊 FINAL DIAGNOSIS\n');
    
    if (!hasUserNameInSidebar) {
      console.log('   ❌ ROOT CAUSE: USER IS NOT AUTHENTICATED');
      console.log('   → Login flow did not persist authentication');
      console.log('   → Permission error is EXPECTED and CORRECT');
      console.log('   → Firestore rules are working as designed');
      console.log('   → DO NOT change firestore.rules to public read');
      console.log('   → Instead: investigate why login is not persisting\n');
    } else if (permissionErrors.length > 0) {
      console.log('   🚨 UNEXPECTED: USER IS AUTHENTICATED BUT PERMISSION DENIED');
      console.log('   → This suggests a Firestore rules issue');
      console.log('   → User token might not have required claims');
      console.log('   → Consider checking Firebase Auth custom claims\n');
    } else if (productCards > 0) {
      console.log('   ✅ SUCCESS: PRODUCTS ARE RENDERING CORRECTLY');
      console.log(`   ✅ ${productCards} product cards detected`);
      console.log('   → No blank cards issue found');
      console.log('   → User authentication is working');
      console.log('   → Firestore permissions are working\n');
    } else if (hasLoadingSpinner) {
      console.log('   ⏳ Page stuck in loading state');
      console.log('   → Data fetch might be hanging');
      console.log('   → Check network tab for slow/failed requests\n');
    } else {
      console.log('   ❓ UNKNOWN STATE: No cards, no errors, no loading');
      console.log('   → Check screenshot for visual clues');
      console.log('   → Possible frontend rendering bug unrelated to auth\n');
    }
    
    console.log('========================================\n');
    
  } catch (error) {
    console.error('❌ ERROR during diagnosis:', error.message);
    console.error('\nStack:', error.stack);
    await page.screenshot({ path: 'diagnostic-screenshot-error-authenticated.png' });
  } finally {
    await browser.close();
  }
}

diagnoseBlankCardsAuthenticated()
  .then(() => {
    console.log('🏁 Authenticated diagnosis complete');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
