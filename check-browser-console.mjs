/**
 * Check browser console for errors using Playwright
 */
import { chromium } from 'playwright';

async function checkBrowserConsole() {
  console.log('🌐 Opening browser to check console...\n');
  
  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  
  // Capture console messages
  const consoleMessages = [];
  page.on('console', msg => {
    consoleMessages.push(`[${msg.type()}] ${msg.text()}`);
  });
  
  // Capture page errors
  const pageErrors = [];
  page.on('pageerror', error => {
    pageErrors.push(error.message);
  });
  
  try {
    // Navigate to products page
    console.log('Navigating to http://localhost:3000/dashboard/products...\n');
    await page.goto('http://localhost:3000/dashboard/products', { 
      waitUntil: 'networkidle',
      timeout: 60000 
    });
    
    // Wait for products to load
    await page.waitForTimeout(5000);
    
    // Get the actual product count from the page
    const productCountText = await page.textContent('[class*="text-slate-400"]').catch(() => null);
    console.log('Product count text from page:', productCountText);
    
    // Check if products array is accessible
    const productsData = await page.evaluate(() => {
      return {
        totalCards: document.querySelectorAll('[class*="glass-card"]').length,
        hasProductText: document.body.innerText.includes('product')
      };
    });
    
    console.log('\n📊 PAGE STATE:');
    console.log(`  - Product cards rendered: ${productsData.totalCards}`);
    console.log(`  - Has product text: ${productsData.hasProductText}`);
    
    console.log('\n📋 CONSOLE MESSAGES (last 20):');
    consoleMessages.slice(-20).forEach(msg => console.log(`  ${msg}`));
    
    if (pageErrors.length > 0) {
      console.log('\n❌ PAGE ERRORS:');
      pageErrors.forEach(err => console.log(`  ${err}`));
    }
    
    console.log('\n✅ Check complete. Browser will stay open for 10 seconds...');
    await page.waitForTimeout(10000);
    
  } catch (error) {
    console.error('❌ Error:', error.message);
  } finally {
    await browser.close();
  }
}

checkBrowserConsole()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('Fatal:', err);
    process.exit(1);
  });
