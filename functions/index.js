const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
initializeApp();

// Existing optional schedule retained. API enforcement never depends on it.
exports.downgradeExpiredSubscriptions = onSchedule({
    schedule: '0 16 * * *', timeZone: 'UTC', region: 'asia-southeast1',
    memory: '256MiB', timeoutSeconds: 300,
}, async () => {
    const { normalizeExpiredAccount } = await import('./subscription-lifecycle.mjs');
    const db = getFirestore();
    let downgraded = 0;
    for (const plan of ['Pro', 'pro', 'Professional', 'professional']) {
        const users = await db.collection('users').where('plan', '==', plan).get();
        for (const user of users.docs) {
            // Re-read in a transaction: a concurrent renewal cannot be lost.
            try { if (await normalizeExpiredAccount(db, user.id)) downgraded++; }
            catch (error) { console.error('[SUBSCRIPTION REVIEW]', { uid: user.id, code: error.code || 'UNAVAILABLE' }); }
        }
    }
    console.log('[SUBSCRIPTION NORMALIZATION]', { downgraded });
});
