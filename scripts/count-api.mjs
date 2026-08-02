async function countAPI() {
    try {
        const res = await fetch('http://localhost:3000/api/v1/products?limit=1000');
        const data = await res.json();
        console.log(`[API COUNT] The backend API returned ${data.data.length} products.`);
    } catch (e) {
        console.error(e);
    }
}
countAPI();
