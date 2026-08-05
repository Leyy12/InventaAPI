/**
 * DIAGNOSTIC TEST: Check if products render correctly or show blank cards
 * This script opens the dashboard products page and captures:
 * - Console errors
 * - Network failures
 * - DOM content (product cards)
 * - Screenshot for visual inspection
 */

import { chromium } from 'playwright';

async function diagnoseBlankCards() {
  console.log('🔍 BLANK CARDS DIAGNOSTIC TEST\n');
  console.log('========================================\n');
  
  const browser = await chromium.launch({ headless: false }); // Non-headless to see what happens
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
    console.log('📱 Opening dashboard products page...');
    console.log('   URL: http://localhost:3000/dashboard/products\n');
    
    await page.goto('http://localhost:3000/dashboard/products', {
      waitUntil: 'networkidle',
      timeout: 30000
    });
    
    console.log('✅ Page loaded\n');
    
    // Wait a bit for React to render
    await page.waitForTimeout(3000);
    
    // Check for product cards
    console.log('========================================');
    console.log('🔎 CHECKING DOM CONTENT:\n');
    
    const productCards = await page.locator('[data-testid="product-card"], .product-card, article').count();
    console.log(`   Product cards found: ${productCards}\n`);
    
    // Get the full body text to see what's actually rendered
    const bodyText = await page.locator('body').innerText();
    const hasProductText = bodyText.includes('product') || bodyText.includes('Product');
    console.log(`   Body contains "product" text: ${hasProductText}`);
    console.log(`   Body text length: ${bodyText.length} characters\n`);
    
    // Check for specific elements
    const hasLoadingSpinner = await page.locator('[data-testid="loading"], .loading, .spinner').count() > 0;
    const hasErrorMessage = await page.locator('[data-testid="error"], .error-message').count() > 0;
    const hasEmptyState = await page.locator('[data-testid="empty-state"], .empty-state').count() > 0;
    
    console.log(`   Loading spinner present: ${hasLoadingSpinner}`);
    console.log(`   Error message present: ${hasErrorMessage}`);
    console.log(`   Empty state present: ${hasEmptyState}\n`);
    
    // Capture screenshot
    await page.screenshot({ path: 'diagnostic-screenshot-products-page.png', fullPage: true });
    console.log('📸 Screenshot saved: diagnostic-screenshot-products-page.png\n');
    
    // Report console errors
    console.log('========================================');
    console.log('🐛 CONSOLE MESSAGES:\n');
    
    const errors = consoleMessages.filter(m => m.type === 'error');
    const warnings = consoleMessages.filter(m => m.type === 'warning');
    
    if (errors.length > 0) {
      console.log(`   ❌ ERRORS (${errors.length}):`);
      errors.forEach((err, i) => {
        console.log(`      ${i + 1}. ${err.text}`);
        if (err.location) {
          console.log(`         Location: ${err.location.url}:${err.location.lineNumber}`);
        }
      });
      console.log('');
    } else {
      console.log('   ✅ No console errors\n');
    }
    
    if (warnings.length > 0) {
      console.log(`   ⚠️  WARNINGS (${warnings.length}):`);
      warnings.slice(0, 5).forEach((warn, i) => {
        console.log(`      ${i + 1}. ${warn.text}`);
      });
      if (warnings.length > 5) {
        console.log(`      ... and ${warnings.length - 5} more warnings`);
      }
      console.log('');
    }
    
    // Report network failures
    console.log('========================================');
    console.log('🌐 NETWORK FAILURES:\n');
    
    if (failedRequests.length > 0) {
      console.log(`   ❌ FAILED REQUESTS (${failedRequests.length}):`);
      failedRequests.forEach((req, i) => {
        console.log(`      ${i + 1}. ${req.url}`);
        console.log(`         Error: ${req.failure}`);
      });
      console.log('');
    } else {
      console.log('   ✅ No network failures\n');
    }
    
    // Sample a few product card contents
    console.log('========================================');
    console.log('🃏 SAMPLE PRODUCT CARD CONTENT:\n');
    
    const firstCard = page.locator('article, [data-testid="product-card"], .product-card').first();
    const cardExists = await firstCard.count() > 0;
    
    if (cardExists) {
      const cardHTML = await firstCard.innerHTML();
      console.log('   First card HTML (truncated):');
      console.log(cardHTML.substring(0, 500));
      console.log('   ...\n');
    } else {
      console.log('   ❌ No product cards found in DOM\n');
      
      // Try to find what IS rendered
      console.log('   🔍 CHECKING WHAT IS ACTUALLY RENDERED:\n');
      const mainContent = await page.locator('main, [role="main"], #main-content').first();
      if (await mainContent.count() > 0) {
        const mainHTML = await mainContent.innerHTML();
        console.log('   Main content HTML (first 1000 chars):');
        console.log(mainHTML.substring(0, 1000));
        console.log('   ...\n');
      }
    }
    
    // Final diagnosis
    console.log('========================================');
    console.log('📊 DIAGNOSIS SUMMARY:\n');
    
    if (productCards > 0) {
      console.log('   ✅ Products ARE rendering (cards found in DOM)');
      console.log(`   ✅ ${productCards} product cards detected`);
      if (errors.length > 0) {
        console.log('   ⚠️  But there are console errors that might affect display');
      }
    } else if (hasLoadingSpinner) {
      console.log('   ⏳ Page stuck in loading state (spinner still visible)');
    } else if (hasErrorMessage) {
      console.log('   ❌ Error state displayed (error message component rendered)');
    } else if (hasEmptyState) {
      console.log('   📭 Empty state displayed (no products message)');
    } else {
      console.log('   ❓ UNKNOWN STATE: No cards, no loading, no error');
      console.log('   → This suggests a rendering/data fetching issue');
      console.log('   → Check the screenshot and main content HTML above');
    }
    
    console.log('\n========================================');
    console.log('✅ Diagnostic complete. Check:');
    console.log('   1. diagnostic-screenshot-products-page.png');
    console.log('   2. Console errors/warnings above');
    console.log('   3. Network failures above\n');
    
  } catch (error) {
    console.error('❌ ERROR during diagnosis:', error.message);
    await page.screenshot({ path: 'diagnostic-screenshot-error.png' });
  } finally {
    await browser.close();
  }
}

diagnoseBlankCards()
  .then(() => {
    console.log('🏁 Diagnosis test finished');
    process.exit(0);
  })
  .catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
