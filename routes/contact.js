import express from 'express';
import { getFirestore } from 'firebase-admin/firestore';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// server.js imports database/firebase.js first, so getFirestore() is always ready here.
let adminDb = null;
function getDb() {
  if (!adminDb) {
    adminDb = getFirestore();
  }
  return adminDb;
}
const router = express.Router();

// =====================================================
// POST /api/v1/contact
// Public contact form submission (works without login).
// Writes to the contact_inquiries collection via Admin SDK.
// Global rate limiter (60 req/min per IP) applies at /api/ level.
// =====================================================
router.post('/', async (req, res) => {
  const { fullName, email, company, message } = req.body || {};

  // ── Validation ────────────────────────────────────────
  const name = typeof fullName === 'string' ? fullName.trim() : '';
  const mail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  const comp = typeof company === 'string' ? company.trim() : '';
  const msg = typeof message === 'string' ? message.trim() : '';

  if (!name || !mail || !msg) {
    return res.status(400).json({
      success: false,
      error: 'Full name, email, and message are required.'
    });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(mail)) {
    return res.status(400).json({
      success: false,
      error: 'Please provide a valid email address.'
    });
  }

  if (name.length > 200 || mail.length > 200 || comp.length > 200 || msg.length > 5000) {
    return res.status(400).json({
      success: false,
      error: 'One or more fields exceed the maximum allowed length.'
    });
  }

  try {
    await getDb().collection('contact_inquiries').add({
      fullName: name,
      email: mail,
      company: comp,
      message: msg,
      status: 'pending',
      createdAt: new Date().toISOString(),
      submittedAt: new Date().toISOString(),
      source: 'website',
    });

    return res.status(201).json({
      success: true,
      message: 'Your message has been received. Our team will get back to you soon.'
    });
  } catch (err) {
    console.error('[Contact] Submission error:', err);
    return res.status(500).json({
      success: false,
      error: 'Failed to save your message. Please try again later.'
    });
  }
});

export default router;