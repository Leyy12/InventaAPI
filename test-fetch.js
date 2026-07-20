const fetch = require('node-fetch'); // wait, node 18+ has fetch natively!

async function test() {
    console.log("Testing POST /api/v1/api-keys/generate...");
    const res = await fetch('http://localhost:5001/api/v1/api-keys/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: 'test_123',
            userEmail: 'test@example.com',
            keyName: 'Test Key Backend',
            plan: 'Starter'
        })
    });
    
    const text = await res.text();
    console.log("Status:", res.status);
    console.log("Response:", text);
}

test();
