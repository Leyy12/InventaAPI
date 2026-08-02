const puppeteer = require('puppeteer');

(async () => {
  console.log("Starting visual verification via Puppeteer...");
  const browser = await puppeteer.launch({ headless: "new" });
  const page = await browser.newPage();
  
  // Set viewport to a standard desktop size
  await page.setViewport({ width: 1280, height: 800 });
  
  console.log("Navigating to http://localhost:3000/dashboard/products");
  await page.goto('http://localhost:3000/dashboard/products', { waitUntil: 'networkidle0' });
  
  // Wait a moment for any client-side rendering
  await new Promise(r => setTimeout(r, 2000));
  
  // The product cards are in a grid and have the class "glass-card" and usually a cursor-pointer for selection
  const productCount = await page.evaluate(() => {
    // The products grid has grid-cols-1 md:grid-cols-2 lg:grid-cols-3
    const grids = Array.from(document.querySelectorAll('.grid'));
    // Find the one that contains the most glass-cards
    let maxCards = 0;
    for (const grid of grids) {
       const cards = grid.querySelectorAll('.glass-card.cursor-pointer');
       if (cards.length > maxCards) maxCards = cards.length;
    }
    return maxCards;
  });
  
  console.log(`\n=== VISUAL VERIFICATION RESULT ===`);
  console.log(`Number of product cards actually rendered in the browser DOM: ${productCount}`);
  
  if (productCount === 120) {
      console.log(`✅ MATCH! The DOM rendered exactly 120 products, matching the database total.`);
  } else {
      console.log(`❌ MISMATCH! Expected 120, but the DOM only has ${productCount}.`);
  }
  
  // Check for pagination elements
  const hasPagination = await page.evaluate(() => {
      const buttons = Array.from(document.querySelectorAll('button'));
      return buttons.some(b => 
          b.textContent.toLowerCase().includes('next') || 
          b.textContent.toLowerCase().includes('load more') ||
          b.textContent.toLowerCase().includes('page')
      );
  });
  
  console.log(`Pagination/Load More buttons found in DOM: ${hasPagination ? 'Yes' : 'No'}`);
  
  await browser.close();
})();
