# 📋 CUSTOMER DASHBOARD - COMPLETE SYSTEM SPECIFICATIONS

## 🎯 Overview
B2B Product Catalog API Platform na may **industry-specific dashboards** para sa 4 na business segments:
- 🔨 **Hardware** (Construction & Building Materials)
- 💊 **Pharmacy** (Healthcare & Medicine)  
- 🛒 **Grocery** (SME Retail & Food)
- 👗 **Boutique** (Fashion & Clothing)

---

## 🎨 SECTION 1: DYNAMIC THEMING (Kulay per Industry)

Ang bawat industry ay may **sariling kulay scheme** para maging personalized:

| Industry | Primary Color | Accent Color | Use Case |
|----------|--------------|--------------|----------|
| **Hardware** | Orange (#F97316) | Red (#EF4444) | Construction/Industrial feel |
| **Pharmacy** | Green (#10B981) | Emerald (#059669) | Medical/Healthcare trust |
| **Grocery** | Blue (#3B82F6) | Cyan (#06B6D4) | Fresh/Retail vibrancy |
| **Boutique** | Pink (#EC4899) | Purple (#A855F7) | Fashion/Elegant style |

### Saan Nag-apply ang Kulay:
- ✅ Sidebar navigation (accent color)
- ✅ Primary buttons (CTA buttons)
- ✅ Welcome banner gradient
- ✅ Progress bars
- ✅ Chart visualizations
- ✅ Icon backgrounds
- ✅ Border highlights
- ✅ Hover states

---

## 📄 SECTION 2: THE 6 PAGES OF CUSTOMER DASHBOARD

### 1. 📋 **OVERVIEW PAGE** (Landing/Home)
**Route:** `/dashboard/hardware`, `/dashboard/pharmacy`, `/dashboard/grocery`, `/dashboard/boutique`

**Purpose:** Main dashboard homepage na agad makikita ng user pagka-login

**Components:**
1. **Welcome Banner**
   - Industry-specific icon (Hammer, Pill, ShoppingCart, Shirt)
   - Personalized greeting: "Welcome back, [Builder/Doctor/Retailer/Designer]!"
   - Industry subtitle: "Hardware Store • Construction & Building Materials"
   - Dynamic background gradient matching industry color

2. **Active Plan Badge**
   - Shows current subscription: "Starter", "Professional", or "Enterprise"
   - Monthly quota limit (e.g., "5,000 requests/month")
   - Styled with industry color

3. **Quota Progress Bar**
   - Visual bar showing API usage
   - Left side: Used requests (e.g., "1,247 of 5,000 used")
   - Right side: Remaining quota with percentage
   - Animated gradient progress bar
   - Reset countdown timer ("Resets in 18 days")

4. **Quick Actions (3 Cards)**
   - **Card 1:** Quick Copy API Key
     - Shows masked/full API key
     - One-click copy button
     - Success feedback animation
   
   - **Card 2:** API Documentation
     - Link to `/dashboard/docs`
     - Description of integration guides
     - Hover animation
   
   - **Card 3:** Product Catalog
     - Link to `/dashboard/products`
     - Total product count (industry-specific)
     - Browse button

5. **7-Day API Usage Chart**
   - Simple bar chart showing daily requests
   - Last 7 days (Mon-Sun)
   - Hover to see exact numbers
   - Industry-colored gradient bars
   - Summary stats:
     - Total Requests
     - Daily Average
     - Average Response Time

6. **Industry-Specific Product Categories**
   - 4 clickable category cards
   - Examples:
     - **Hardware:** Construction Materials, Hand Tools, Electrical, Plumbing
     - **Pharmacy:** Prescription Drugs, OTC Medicines, Supplements, Medical Supplies
     - **Grocery:** Fresh Produce, Packaged Goods, Beverages, Household
     - **Boutique:** Women's Wear, Men's Wear, Accessories, Footwear

---

### 2. 📦 **PRODUCTS PAGE** (Product Catalog & Sandbox)
**Route:** `/dashboard/products`

**Purpose:** Browse and test the product catalog with live API sandbox

**Components:**
1. **Search & Filter Bar**
   - Search box: type to find products by name/SKU
   - Category dropdown: filter by industry-specific categories
   - Price range filter: min-max price slider
   - Sort options: Name, Price, Popularity

2. **Customized Product Catalog**
   - Grid of product cards (responsive: 2-3-4 columns)
   - Each card shows:
     - Product image/thumbnail
     - Product name
     - SKU number
     - Price (with currency)
     - "View JSON" button
     - "Add to Test" button

3. **Industry-Specific Defaults**
   - **Hardware:** Shows construction materials, tools first
   - **Pharmacy:** Shows medicines, supplements first
   - **Grocery:** Shows food items, beverages first
   - **Boutique:** Shows clothing, accessories first

4. **API Sandbox (Testing Panel)**
   - Collapsible panel at the bottom/side
   - "Test Fetch" button
   - Shows live API request/response
   - Displays JSON format
   - Copy response button
   - Language selector: cURL, JavaScript, Python, PHP
   - Response time indicator

---

### 3. 🔑 **API KEYS PAGE** (Credential Management)
**Route:** `/dashboard/api-keys`

**Purpose:** Generate, view, and manage API authentication keys

**Components:**
1. **Security Warning Banner**
   - Red/yellow alert box
   - Warning message: "Never share your API keys publicly"
   - Best practices tips
   - Link to security documentation

2. **Active Keys Table**
   - Columns:
     - Key Name (user-defined label)
     - Created Date
     - Last Used
     - Status (Active/Inactive)
     - Actions (View/Copy/Delete)
   - Keys are masked: `daas_***************xyz`
   - Eye icon to toggle visibility
   - Copy button with success feedback

3. **Generate New Key Button**
   - Primary button (industry-colored)
   - Opens modal/form:
     - Key name input
     - Optional: expiration date
     - Optional: rate limit override
   - Generates unique key
   - Shows key only once with warning

4. **Delete/Revoke Action**
   - Trash icon button
   - Confirmation modal:
     - "Are you sure?"
     - Warning that apps using this key will stop working
     - Type key name to confirm deletion
   - Permanent deletion (cannot undo)

---

### 4. 📖 **DOCUMENTATION PAGE** (Integration Guide)
**Route:** `/dashboard/docs`

**Purpose:** Complete developer guide for API integration

**Components:**
1. **Quick Start Guide**
   - Step-by-step numbered list:
     1. Get your API key
     2. Make your first request
     3. Handle the response
     4. Error handling
   - Code examples for each step

2. **Authentication Section**
   - How to use Bearer token
   - Header format: `Authorization: Bearer YOUR_API_KEY`
   - Code examples in multiple languages

3. **Endpoint Reference**
   - Organized by resource:
     - Products API
     - Categories API
     - Search API
     - Recommendations API
   - For each endpoint:
     - HTTP Method (GET, POST, etc.)
     - Full URL path
     - Required parameters
     - Optional parameters
     - Response format (JSON schema)
     - Example request
     - Example response
     - Possible error codes

4. **Code Snippets (Tabbed)**
   - Tabs for:
     - JavaScript (fetch, axios)
     - Python (requests)
     - PHP (cURL, Guzzle)
     - cURL (command line)
   - Copy button for each snippet
   - Syntax highlighting

5. **Error Codes Table**
   - HTTP status codes (200, 400, 401, 404, 429, 500)
   - Error message examples
   - How to handle each error

---

### 5. ✨ **RECOMMENDATIONS PAGE** (AI Insights)
**Route:** `/dashboard/recommendations`

**Purpose:** AI-powered product suggestions and business insights

**Components:**
1. **AI Suggestions Panel**
   - "Trending in Your Industry" section
   - List of recommended products:
     - Product image
     - Product name
     - Reason for recommendation (e.g., "High demand this season")
     - Add to catalog button
   - Industry-specific examples:
     - **Hardware:** "Cement sales increase during rainy season"
     - **Pharmacy:** "Flu season: stock up on cold medicine"
     - **Grocery:** "Back-to-school: snacks & beverages trending"
     - **Boutique:** "Summer dresses in high demand"

2. **Inventory Insights**
   - "Products to Stock" recommendations
   - Based on:
     - Historical sales data
     - Seasonal trends
     - Market analysis
     - Competitor insights
   - Each insight shows:
     - Product name
     - Expected demand percentage
     - Confidence score
     - Trend indicator (↑ rising, ↓ declining)

3. **Market Intelligence**
   - Industry news/updates
   - Price trend alerts
   - New product releases
   - Supplier recommendations

---

### 6. 📊 **ANALYTICS PAGE** (Detailed Reports)
**Route:** `/dashboard/analytics`

**Purpose:** In-depth API usage analytics and performance metrics

**Components:**
1. **Traffic Chart (Interactive)**
   - Time range selector:
     - Last 24 hours
     - Last 7 days  
     - Last 30 days
     - Custom date range
   - Line/bar chart showing request volume
   - Zoom and pan controls
   - Export chart as PNG/CSV

2. **Endpoint Breakdown**
   - Donut/pie chart
   - Shows percentage per API endpoint:
     - Products API: 80%
     - Search API: 15%
     - Recommendations API: 5%
   - Click to drill down details
   - Color-coded by endpoint type

3. **Health & Performance Panel**
   - **Response Time Chart**
     - Average response time over time
     - Target: <100ms
     - Shows spikes and slowdowns
   
   - **Error Rate Monitor**
     - Percentage of failed requests
     - Error types breakdown
     - Alert if > 1% error rate
   
   - **Success Rate**
     - Percentage of successful 200 responses
     - Target: >99%

4. **Top Products/Endpoints Table**
   - Most requested products
   - Most called endpoints
   - Peak usage times
   - Geographic distribution (if available)

5. **Export Reports**
   - Download CSV/Excel
   - Generate PDF report
   - Schedule email reports

---

## 🔒 SECTION 3: SECURITY RULES (Bawal Makita ng Customer)

### ❌ PROHIBITED INFORMATION:
Customers **CANNOT** see:
- ❌ Other customers' data, keys, or logs
- ❌ Platform revenue/financial data
- ❌ Total number of users on platform
- ❌ Backend system settings
- ❌ Database credentials
- ❌ Admin panel access
- ❌ Other customers' API usage
- ❌ Pricing markup/margins
- ❌ Internal company documents

### ✅ ALLOWED INFORMATION:
Customers **CAN** see:
- ✅ Their own API keys
- ✅ Their own usage statistics
- ✅ Their own quota/limits
- ✅ Product catalog (public data)
- ✅ Public documentation
- ✅ Their own billing history
- ✅ Industry-general insights (aggregated data)

### 🛡️ SECURITY MEASURES:
1. **Authentication Required**
   - All dashboard pages require login
   - Session timeout after 30 minutes of inactivity
   - API keys are hashed in database

2. **Authorization Checks**
   - User can only access their own data
   - Role-based access control (Customer vs Admin)
   - API requests filtered by user ID

3. **Enterprise Plan Restrictions**
   - No direct "Upgrade to Enterprise" button with pricing
   - Must redirect to "Contact Sales" form
   - Sales team handles custom pricing offline
   - Prevents customers from seeing enterprise pricing structure

4. **Rate Limiting**
   - Enforced per API key
   - Dashboard shows warnings when approaching limit
   - Cannot exceed plan quota

---

## 🔄 USER FLOW

### First-Time User Journey:
1. User selects plan on pricing page (e.g., **Professional - Hardware**)
2. Clicks "Get Started"
3. Subscription modal opens
4. Fills in: Email, Name, **Business Segment** (Hardware/Pharmacy/Grocery/Boutique)
5. Completes payment
6. **Auto-redirects to industry-specific dashboard**
7. Sees: `/dashboard/hardware` (or pharmacy/grocery/boutique)
8. Welcome banner shows personalized greeting
9. Overview page displays orange theme (hardware colors)
10. Product categories show construction/tools/electrical/plumbing
11. User copies API key from Quick Actions
12. Navigates to Documentation
13. Integrates API into their POS/inventory system
14. Monitors usage in Analytics page
15. Gets AI recommendations for inventory

### Returning User Journey:
1. Logs in
2. Lands on Overview page (industry-specific)
3. Checks quota progress bar
4. Reviews 7-day usage chart
5. Copies API key if needed
6. Browses new products
7. Checks recommendations
8. Views detailed analytics
9. Logs out

---

## 🎨 DESIGN SYSTEM

### Color Palette:
```
Hardware:   Primary: #F97316 (Orange), Secondary: #EF4444 (Red)
Pharmacy:   Primary: #10B981 (Green), Secondary: #059669 (Emerald)
Grocery:    Primary: #3B82F6 (Blue), Secondary: #06B6D4 (Cyan)
Boutique:   Primary: #EC4899 (Pink), Secondary: #A855F7 (Purple)

Neutrals:   Background: #0F172A (Slate 900)
            Cards: #1E293B (Slate 800) with glass effect
            Text: #F1F5F9 (Slate 100)
            Muted: #64748B (Slate 500)
```

### Typography:
- **Headings:** Bold, 24-32px
- **Body:** Regular, 14-16px
- **Labels:** Medium, 12-14px
- **Code:** Mono font, 12px

### Spacing:
- **Cards:** padding 24px, gap 16px
- **Sections:** margin-bottom 32px
- **Grids:** gap 16px (mobile) to 24px (desktop)

### Components:
- **Glass Cards:** Frosted glass effect with backdrop blur
- **Buttons:** Rounded 8px, padding 12px 24px
- **Progress Bars:** Height 16-20px, rounded full
- **Charts:** Responsive, industry-colored gradients

---

## 📱 RESPONSIVE DESIGN

### Breakpoints:
- **Mobile:** < 768px (1 column layouts)
- **Tablet:** 768px - 1024px (2 column layouts)
- **Desktop:** > 1024px (3-4 column layouts)

### Mobile Optimizations:
- Collapsible sidebar
- Stacked cards
- Simplified charts
- Touch-friendly buttons (min 44px height)
- Swipeable tabs

---

## 🚀 PERFORMANCE

### Optimization Targets:
- **Page Load:** < 2 seconds
- **API Response:** < 100ms
- **Chart Render:** < 500ms
- **Smooth animations:** 60 FPS

### Caching Strategy:
- Product catalog: Cache 1 hour
- User data: No cache (always fresh)
- Documentation: Cache 24 hours
- Static assets: Cache indefinitely

---

## ✅ IMPLEMENTATION STATUS

### ✅ Completed:
- [x] Hardware Dashboard (Complete with all 6 sections)
- [x] Pharmacy Dashboard (Created)
- [x] Grocery Dashboard (Created)
- [x] Boutique Dashboard (Created)
- [x] Dynamic routing based on business segment
- [x] Subscription modal (no duplicate plan dropdown)
- [x] Industry-specific color theming
- [x] Overview page components:
  - Welcome banner
  - Plan badge
  - Quota progress bar
  - Quick actions
  - 7-day chart
  - Category cards

### 🔄 To Be Implemented:
- [ ] Products page (catalog + sandbox)
- [ ] API Keys page (generation + management)
- [ ] Documentation page (full guide)
- [ ] Recommendations page (AI insights)
- [ ] Analytics page (detailed reports)
- [ ] Mobile responsive sidebar
- [ ] Backend API integration
- [ ] Real data from database

---

## 📝 NOTES

1. **Lahat ng dashboards** (Hardware, Pharmacy, Grocery, Boutique) ay may **same structure** pero **different:**
   - Colors (orange, green, blue, pink)
   - Icons (hammer, pill, cart, shirt)
   - Greetings (Builder, Doctor, Retailer, Designer)
   - Product categories (industry-specific)
   - Sample data (relevant to industry)

2. **Ang purpose ng bawat page:**
   - **Overview:** See everything at a glance
   - **Products:** Explore and test catalog
   - **API Keys:** Manage credentials
   - **Docs:** Learn how to integrate
   - **Recommendations:** Get business insights
   - **Analytics:** Monitor performance

3. **Security is paramount:**
   - Users only see their own data
   - API keys are protected
   - Enterprise pricing hidden
   - No access to other customers

4. **User experience is friendly:**
   - Technical pero hindi nakakailanman
   - Visual feedback (copy success, loading states)
   - Helpful tooltips and guides
   - Industry-specific personalization

---

**End of Documentation** 🎉
