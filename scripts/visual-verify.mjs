import { chromium } from 'playwright';
import path from 'path';

async function verifyDashboard() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  
  try {
    console.log("Navigating to dashboard products page...");
    await page.goto('http://localhost:3000/dashboard/products', { waitUntil: 'networkidle' });

    // Wait for the table or list to render
    // Looking at common UI patterns in this project, it's either a table or a grid
    // Let's count standard rows or card elements
    console.log("Waiting for products to load in the UI...");
    
    // Give it a few seconds to fetch from Firebase
    await page.waitForTimeout(5000);

    // Take a screenshot for visual proof
    const screenshotPath = path.resolve('C:\\Users\\ACER\\.gemini\\antigravity-ide\\brain\\b65a74f8-07c3-40de-8a66-bbe2c8519c4c\\dashboard-proof.png');
    await page.screenshot({ path: screenshotPath, fullPage: true });
    
    // Attempt to count table rows (tbody tr) or product cards (assuming a grid)
    const rowCount = await page.evaluate(() => {
        const rows = document.querySelectorAll('tbody tr');
        if (rows.length > 0) return rows.length;
        
        // If not a table, try common card classes
        const cards = document.querySelectorAll('.product-card, [data-testid="product-item"], .bg-white.rounded-lg.shadow');
        return cards.length;
    });

    console.log(`[VISUAL COUNT] Found ${rowCount} product elements rendered on the page.`);
    console.log(`[VISUAL PROOF] Screenshot saved to ${screenshotPath}`);

  } catch (err) {
    console.error("Error during visual verification:", err);
  } finally {
    await browser.close();
  }
}

verifyDashboard();
