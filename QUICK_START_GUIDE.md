# InventaAPI - Quick Start Guide

## 🚀 Start All Services (3 Terminals)

### Terminal 1: Backend API
```bash
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2
node server.js
```
✅ Running on: **http://localhost:5000**

---

### Terminal 2: Customer Dashboard
```bash
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2\dashboard
npm run dev
```
✅ Running on: **http://localhost:3000**

---

### Terminal 3: Admin Panel
```bash
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2\admin-panel
npm run dev
```
✅ Running on: **http://localhost:3001**

---

## 🌐 Access URLs

| Service | URL | Purpose |
|---------|-----|---------|
| **Backend API** | http://localhost:5000 | REST API endpoints |
| **Customer Dashboard** | http://localhost:3000 | SME customer portal (indigo theme) |
| **Admin Panel** | http://localhost:3001 | Super admin control panel (red theme) |

---

## 👤 Login Credentials

### Customer/Developer Account
- **Email:** (your customer email)
- **Password:** (your customer password)
- **Access:** Customer Dashboard only (`localhost:3000/dashboard`)

### Super Admin Account
- **Email:** `balquinkevinconeal27@gmail.com`
- **Password:** (your admin password)
- **Access:** Admin Panel only (`localhost:3001`)
- **Login Flow:** Login on `:3000` → Auto-redirect to `:3001` via token bridge

---

## 🎨 Visual Identification

### Customer Dashboard (Port 3000)
- 🔵 **Indigo** color scheme
- Label: "SME Consumer"
- Routes: Overview, Products, API Keys, Documentation, Analytics

### Admin Panel (Port 3001)
- 🔴 **Red** color scheme
- Label: "Super Admin Control Panel"
- Routes: Dashboard, Product Requests, Catalogs, Settings, etc.

---

## 🐛 Troubleshooting

### "Cannot connect to localhost:3001"
```bash
# Make sure admin panel is running
cd admin-panel
npm run dev
```

### "CORS error" in browser
```bash
# Restart backend server (CORS config loads on startup)
cd c:\Users\ACER\Downloads\APIinventaB2-backup\APIinventaB2
node server.js
```

### "Token verification failed"
```bash
# Check backend .env has Firebase Admin SDK credentials
# FIREBASE_PROJECT_ID
# FIREBASE_CLIENT_EMAIL
# FIREBASE_PRIVATE_KEY
```

### Port already in use
```bash
# Kill process on port 3000
netstat -ano | findstr :3000
taskkill /PID <process_id> /F

# Kill process on port 3001
netstat -ano | findstr :3001
taskkill /PID <process_id> /F

# Kill process on port 5000
netstat -ano | findstr :5000
taskkill /PID <process_id> /F
```

---

## 📝 Quick Testing Checklist

- [ ] All 3 services running (backend, customer dashboard, admin panel)
- [ ] Customer login works on `localhost:3000`
- [ ] Admin login redirects to `localhost:3001`
- [ ] Customer dashboard shows indigo theme
- [ ] Admin panel shows red theme
- [ ] No console errors
- [ ] Token bridge authentication successful
- [ ] Session persists after page refresh

---

## 📚 Full Documentation

For complete details, see:
- `PHASE_5_FINAL_TESTING_GUIDE.md` - Complete testing procedures
- `FINAL_ARCHITECTURE_SUMMARY.md` - Full architecture documentation
- `PHASE_4_CUSTOMER_DASHBOARD_CLEANUP_SUMMARY.md` - Phase 4 changes

---

**Ready to go! 🎉**
