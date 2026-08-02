# InventaAPI Admin Panel

Admin control panel for managing the DaaS platform, running on **localhost:3001**.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Run development server:
```bash
npm run dev
```

Admin panel will start on: **http://localhost:3001**

## Authentication

- Admin users must login via customer dashboard first (localhost:3000)
- Token bridge handles cross-origin authentication
- Sessions persist after initial login

## Project Structure

```
admin-panel/
├── src/
│   ├── app/                    # Next.js 14 App Router
│   │   ├── layout.tsx          # Root layout
│   │   ├── page.tsx            # Dashboard home
│   │   └── [routes]/           # Admin routes
│   ├── components/
│   │   ├── layout/             # Sidebar, Navbar
│   │   └── admin/              # Admin-specific components
│   └── lib/
│       └── firebase/
│           ├── config.ts       # Firebase config
│           └── admin-auth-context.tsx  # Admin auth provider
└── public/
```

## Features

- Super Admin dashboard
- Product catalog management (Hardware, Pharmacy, Grocery, Clothing)
- API consumer management
- Security center & audit logs
- System settings

## Tech Stack

- Next.js 16.2.9 (App Router)
- React 19
- TypeScript 5
- Tailwind CSS 4
- Firebase Authentication
- Lucide React Icons
