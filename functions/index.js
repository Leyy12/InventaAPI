const { onSchedule } = require('firebase-functions/v2/scheduler');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

// Initialize Firebase Admin SDK inside the function package.
// This is separate from the Express backend's initialization.
initializeApp();

const db = getFirestore();

// ---------------------------------------------------------------------------
// FREE PLAN CONFIGURATION
// Applied when a Pro subscription expires and is downgraded.
// ---------------------------------------------------------------------------
const FREE_PLAN_CONFIG = {
    plan: 'Free',
    apiRequestLimit: 50,
    subscription_status: 'inactive',
};

// ---------------------------------------------------------------------------
// SCHEDULED FUNCTION: downgradeExpiredSubscriptions
//
// Runs EVERY DAY at 12:00 AM Philippine Time (UTC+8 = 4:00 PM UTC previous day)
// Cron: "0 16 * * *" (UTC) = midnight PHT
//
// What it does:
// 1. Queries all Firestore users where plan == "Pro"
// 2. For each, checks if subscriptionExpiresAt <= now (expired)
// 3. If expired, updates the document: plan → "Free", apiRequestLimit → 50
//    (Uses Admin SDK — bypasses all Firestore client security rules)
//
// REQUIREMENT: Firebase Blaze (pay-as-you-go) plan.
// To deploy: run `firebase deploy --only functions` from the /functions directory.
// ---------------------------------------------------------------------------
exports.downgradeExpiredSubscriptions = onSchedule(
    {
        // "0 16 * * *" UTC = "0 0 * * *" PHT (midnight Philippine Time)
        schedule: '0 16 * * *',
        timeZone: 'UTC',
        region: 'asia-southeast1', // Singapore — closest to Philippines
        memory: '256MiB',
        timeoutSeconds: 300,       // 5-minute timeout for bulk operations
    },
    async (event) => {
        const startTime = new Date().toISOString();
        console.log(`[DOWNGRADE JOB] ▶️ Starting at ${startTime}`);

        const now = new Date();
        let processedCount = 0;
        let downgradedCount = 0;
        let errorCount = 0;

        try {
            // Query all Pro users — Firestore index required on (plan, subscriptionExpiresAt)
            // The index will be auto-created on first deploy if needed.
            const proUsersSnapshot = await db
                .collection('users')
                .where('plan', '==', 'Pro')
                .get();

            if (proUsersSnapshot.empty) {
                console.log('[DOWNGRADE JOB] ✅ No Pro plan users found. Nothing to do.');
                return;
            }

            console.log(`[DOWNGRADE JOB] Found ${proUsersSnapshot.size} Pro plan users. Checking expiry...`);

            // Process in batches of 500 (Firestore batch limit)
            const BATCH_SIZE = 500;
            let batch = db.batch();
            let batchCount = 0;

            for (const userDoc of proUsersSnapshot.docs) {
                processedCount++;
                const data = userDoc.data();
                const userId = userDoc.id;

                // Check if subscription has expired
                const expiresAtRaw = data.subscriptionExpiresAt;
                if (!expiresAtRaw) {
                    // Pro user without an expiry date — likely a legacy/manually-set account.
                    // Do NOT downgrade. Log for admin review.
                    console.warn(`[DOWNGRADE JOB] ⚠️ Pro user ${userId} has no subscriptionExpiresAt. Skipping.`);
                    continue;
                }

                // Parse the expiry date (handles both ISO strings and Firestore Timestamps)
                let expiryDate;
                if (expiresAtRaw instanceof Timestamp) {
                    expiryDate = expiresAtRaw.toDate();
                } else if (typeof expiresAtRaw === 'string') {
                    expiryDate = new Date(expiresAtRaw);
                } else {
                    console.warn(`[DOWNGRADE JOB] ⚠️ Unknown subscriptionExpiresAt type for ${userId}: ${typeof expiresAtRaw}`);
                    continue;
                }

                // Check if expired
                if (expiryDate > now) {
                    // Not expired yet — leave alone
                    continue;
                }

                // Subscription has expired — queue the downgrade
                const userRef = db.collection('users').doc(userId);
                batch.update(userRef, {
                    plan: FREE_PLAN_CONFIG.plan,
                    apiRequestLimit: FREE_PLAN_CONFIG.apiRequestLimit,
                    subscription_status: FREE_PLAN_CONFIG.subscription_status,
                    downgradedAt: now.toISOString(),
                    // Keep subscriptionExpiresAt as audit trail — do NOT delete it
                });

                batchCount++;
                downgradedCount++;
                console.log(`[DOWNGRADE JOB] Queueing downgrade for user ${userId} (expired: ${expiryDate.toISOString()})`);

                // Commit batch when full
                if (batchCount === BATCH_SIZE) {
                    try {
                        await batch.commit();
                        console.log(`[DOWNGRADE JOB] ✅ Batch committed (${batchCount} updates).`);
                    } catch (batchErr) {
                        errorCount++;
                        console.error(`[DOWNGRADE JOB] ❌ Batch commit failed:`, batchErr.message);
                    }
                    // Reset batch
                    batch = db.batch();
                    batchCount = 0;
                }
            }

            // Commit remaining items in last partial batch
            if (batchCount > 0) {
                try {
                    await batch.commit();
                    console.log(`[DOWNGRADE JOB] ✅ Final batch committed (${batchCount} updates).`);
                } catch (batchErr) {
                    errorCount++;
                    console.error(`[DOWNGRADE JOB] ❌ Final batch commit failed:`, batchErr.message);
                }
            }

        } catch (err) {
            errorCount++;
            console.error('[DOWNGRADE JOB] ❌ Fatal error during job:', err.message);
            throw err; // Re-throw so Firebase marks the invocation as failed
        }

        const endTime = new Date().toISOString();
        console.log(`[DOWNGRADE JOB] ✅ Completed at ${endTime}`);
        console.log(`[DOWNGRADE JOB] Summary: processed=${processedCount}, downgraded=${downgradedCount}, errors=${errorCount}`);
    }
);
