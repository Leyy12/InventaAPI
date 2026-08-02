import express from 'express';

// Firebase Admin SDK is initialized centrally in database/firebase.js via service-account.json.
// No re-initialization needed here — getAuth() can be imported and used directly when needed.

const router = express.Router();

// NOTE: Token bridge endpoint removed - admin panel now uses direct Firebase authentication
// If you need to restore the token bridge functionality in the future, check git history

export default router;
