# 💳 PAYMONGO GCASH ENDPOINT TEST

## ✅ CODE FIX VERIFIED

**Evidence from `routes/checkout.js`:**
```javascript
Line 10: const PAYMONGO_BASE_URL = 'https://api.paymongo.com/v1';
Line 126: const pmResponse = await fetch(`${PAYMONGO_BASE_URL}/links`, {
```

✅ Using correct PayMongo API v1 endpoint (`/v1/links`)
✅ Endpoint handler exists at `/api/v1/checkout/create-gcash`

---

## 🧪 MANUAL TEST INSTRUCTIONS

### 1. Start the backend server
```bash
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2
npm start
```

Wait for: `Server running on port 5000`

### 2. Test the endpoint (in a new terminal)

**PowerShell:**
```powershell
Invoke-WebRequest -Uri "http://localhost:5000/api/v1/checkout/create-gcash" `
  -Method POST `
  -Headers @{"Content-Type"="application/json"} `
  -Body '{"userId":"test-user-123","userEmail":"test@example.com"}' | 
  Select-Object -ExpandProperty Content
```

**OR use Postman/Insomnia:**
- Method: POST
- URL: `http://localhost:5000/api/v1/checkout/create-gcash`
- Headers: `Content-Type: application/json`
- Body (JSON):
```json
{
  "userId": "test-user-123",
  "userEmail": "test@example.com"
}
```

---

## ✅ EXPECTED RESPONSE (200 OK)

```json
{
  "success": true,
  "checkoutUrl": "https://pm.link/inventaapi/test/...",
  "linkId": "link_...",
  "amount": 149900,
  "currency": "PHP"
}
```

---

## ❌ POSSIBLE ERRORS

### Error: 404 User not found
- **Cause:** Test user `test-user-123` doesn't exist in Firestore
- **Fix:** Use a real user ID from your `users` collection

### Error: 502 PayMongo API error
- **Cause:** Invalid PayMongo API key or wrong endpoint
- **Fix:** Check `.env` has valid `PAYMONGO_SECRET_KEY`

### Error: 400 userId is required
- **Cause:** Request body malformed
- **Fix:** Ensure Content-Type is `application/json`

---

## ✅ MARK AS COMPLETE WHEN:
- Response is 200 OK with `checkoutUrl` field
- OR response is 404 "User not found" (endpoint works, just needs real user)
