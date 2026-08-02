import express from 'express';

const router = express.Router();

// ═══════════════════════════════════════════════════════════════════════════
// SECURITY NOTICE: ENDPOINTS DISABLED
// ═══════════════════════════════════════════════════════════════════════════
//
// These product management endpoints were exposed without authentication
// and are now DISABLED pending proper Firebase Admin auth implementation.
//
// CURRENT ARCHITECTURE:
// - Admin product operations go directly from the dashboard to Firestore
//   using Firebase Client SDK, secured by Firestore Security Rules.
// - These backend routes were orphaned (no client calls them).
//
// IF YOU NEED BACKEND CRUD LATER:
// - Implement Firebase Admin token verification middleware
// - Update frontend to send Firebase ID tokens in Authorization header
// - Re-enable routes with proper auth
//
// ALTERNATIVE FOR IMMEDIATE USE:
// - Use the admin dashboard: /dashboard (requires admin role)
// - Firestore rules enforce admin-only write access
//
// ═══════════════════════════════════════════════════════════════════════════

router.all('*', (req, res) => {
  res.status(410).json({ 
    error: 'Endpoint Disabled',
    message: 'Product management endpoints are deprecated and have been disabled for security reasons. Use the admin dashboard for product operations.',
    details: 'These endpoints were exposed without authentication. Admin operations now use Firestore directly with proper security rules.',
    alternative: `${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/dashboard`,
    documentation: 'Contact the development team if you need backend API access.'
  });
});

export default router;
