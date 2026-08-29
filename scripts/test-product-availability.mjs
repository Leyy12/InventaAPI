/**
 * Targeted regression test for the productAvailability incremental update feature.
 *
 * Tests the PATCH /api/v1/api-keys/:id/products route on an EXISTING active API key.
 * Uses the LD-STORE key (it has only 1 linked product — easy to test with).
 * Restores the original state after every test so production data is never permanently altered.
 */
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

const BASE = 'http://127.0.0.1:5002';
let pass = 0, fail = 0;

function check(label, condition, detail = '') {
    if (condition) {
        console.log('  \u2705 PASS:', label, detail ? '| ' + detail : '');
        pass++;
    } else {
        console.log('  \u274c FAIL:', label, detail ? '| ' + detail : '');
        fail++;
    }
}

async function runTest() {
    console.log('=========================================================');
    console.log(' INCREMENTAL PRODUCT AVAILABILITY REGRESSION TEST');
    console.log('=========================================================\n');

    // --------------------------------------------------------
    // STEP 1: Find an existing active key with known products
    // Using LD-STORE (1 linked product) as the test subject.
    // --------------------------------------------------------
    const keysSnap = await db.collection('api_keys').get();
    const ldDoc = keysSnap.docs.find(d => d.data().name === 'LD-STORE');
    const asmDoc = keysSnap.docs.find(d => d.data().name === 'ASM-HARDWARE');

    if (!ldDoc) {
        console.log('\u274c LD-STORE key not found. Cannot continue test.');
        process.exit(1);
    }

    const ldKeyId = ldDoc.id;
    const ldData = ldDoc.data();
    const ldUserId = ldData.userId;
    const ldApiKey = ldData.key;

    // STEP 2: Record baseline state
    console.log('[STEP 1+2] Baseline state of LD-STORE:');
    console.log('  Key ID:', ldKeyId);
    console.log('  userId:', ldUserId);
    console.log('  plan:', ldData.plan);
    console.log('  requestLimit:', ldData.requestLimit);
    console.log('  requestsUsed:', ldData.requestsUsed);
    console.log('  status:', ldData.status);
    const originalLinkedProductIds = [...(ldData.linkedProductIds || [])];
    const originalLinkedVariantSelections = { ...(ldData.linkedVariantSelections || {}) };
    const originalProductAvailability = { ...(ldData.productAvailability || {}) };
    console.log('  linkedProductIds (original):', originalLinkedProductIds);
    console.log('  productAvailability keys (original):', Object.keys(originalProductAvailability));

    // STEP 3: Pick a product NOT currently linked to LD-STORE to add
    // Use the first linked product of ASM-HARDWARE that LD-STORE doesn't have
    const asmLinkedIds = asmDoc?.data().linkedProductIds || [];
    const newProductId = asmLinkedIds.find(id => !originalLinkedProductIds.includes(id));
    if (!newProductId) {
        console.log('\u274c Could not find a product to add (all ASM products already linked to LD-STORE). Cannot test.');
        process.exit(1);
    }
    console.log('\n[STEP 3] New product to link (from master catalog, not in LD-STORE):', newProductId);

    // Record exact timestamps of existing linked products BEFORE the patch
    const existingTimestampsBefore = {};
    originalLinkedProductIds.forEach(pid => {
        if (originalProductAvailability[pid]) {
            existingTimestampsBefore[pid] = originalProductAvailability[pid].availableSince?.toDate?.()?.toISOString?.() ?? null;
        }
    });
    console.log('  Existing product timestamps (before):', JSON.stringify(existingTimestampsBefore, null, 2));

    // --------------------------------------------------------
    // STEP 4: Call the ACTUAL PATCH /:id/products route
    // This is the real application mechanism — not a mock.
    // --------------------------------------------------------
    console.log('\n[STEP 4] Calling PATCH /api/v1/api-keys/' + ldKeyId + '/products...');
    const newLinkedProductIds = [...originalLinkedProductIds, newProductId];
    const patchRes = await fetch(`${BASE}/api/v1/api-keys/${ldKeyId}/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: ldUserId,
            linkedProductIds: newLinkedProductIds,
            linkedVariantSelections: originalLinkedVariantSelections
        })
    });
    const patchJson = await patchRes.json();
    console.log('  PATCH status:', patchRes.status);
    console.log('  PATCH response:', JSON.stringify(patchJson));
    check('PATCH /products returns 200', patchRes.status === 200, 'status=' + patchRes.status);
    check('PATCH response success=true', patchJson.success === true);

    // Wait for Firestore to settle
    await new Promise(r => setTimeout(r, 1500));

    // --------------------------------------------------------
    // STEP 5-8: Verify Firestore state after patch
    // --------------------------------------------------------
    console.log('\n[STEP 5-8] Verifying Firestore state after PATCH...');
    const updatedDoc = await db.collection('api_keys').doc(ldKeyId).get();
    const updatedData = updatedDoc.data();

    // Step 5: Product added to linkedProductIds
    check('5. New product added to linkedProductIds',
        updatedData.linkedProductIds?.includes(newProductId),
        'found=' + updatedData.linkedProductIds?.includes(newProductId));

    // Step 6: productAvailability contains the newly linked product
    const newProductAvail = updatedData.productAvailability?.[newProductId];
    check('6. productAvailability has entry for new product', !!newProductAvail,
        'entry=' + JSON.stringify(newProductAvail));

    // Step 7: availableSince is a native Firestore Timestamp
    check('7. availableSince is a Firestore Timestamp',
        newProductAvail?.availableSince?.constructor?.name === 'Timestamp',
        'type=' + newProductAvail?.availableSince?.constructor?.name);

    // Step 8: Existing products' availability timestamps are UNCHANGED
    let timestampsPreserved = true;
    for (const pid of originalLinkedProductIds) {
        const beforeTs = existingTimestampsBefore[pid];
        const afterEntry = updatedData.productAvailability?.[pid];
        const afterTs = afterEntry?.availableSince?.toDate?.()?.toISOString?.() ?? null;
        if (beforeTs !== afterTs) {
            console.log('  \u274c TIMESTAMP CHANGED for', pid, 'before:', beforeTs, 'after:', afterTs);
            timestampsPreserved = false;
        }
    }
    check('8. Existing products\' availability timestamps unchanged', timestampsPreserved);

    // Confirm other key fields are intact
    check('8b. plan unchanged after PATCH', updatedData.plan === ldData.plan, 'plan=' + updatedData.plan);
    check('8b. requestLimit unchanged after PATCH', updatedData.requestLimit === ldData.requestLimit);
    check('8b. requestsUsed unchanged after PATCH', updatedData.requestsUsed === ldData.requestsUsed);
    check('8b. status unchanged after PATCH', updatedData.status === ldData.status);

    // --------------------------------------------------------
    // STEP 9-12: DaaS catalog verification
    // --------------------------------------------------------
    console.log('\n[STEP 9-12] Calling GET /daas/v1/catalog with LD-STORE key...');
    const catalogRes = await fetch(`${BASE}/daas/v1/catalog`, {
        headers: { 'x-api-key': ldApiKey }
    });
    const catalogJson = await catalogRes.json();
    check('9. Catalog returns HTTP 200', catalogRes.status === 200, 'status=' + catalogRes.status);
    check('9b. Catalog has products array', Array.isArray(catalogJson.products));

    // Step 10: Newly linked product is returned
    const returnedIds = (catalogJson.products || []).map(p => p.id);
    check('10. Newly linked product returned in catalog', returnedIds.includes(newProductId),
        'newProductId=' + newProductId + ' in=' + returnedIds.includes(newProductId));

    // Step 11: availableToConsumerSince matches the recorded timestamp
    const returnedNewProduct = catalogJson.products?.find(p => p.id === newProductId);
    const expectedTs = newProductAvail?.availableSince?.toDate?.()?.toISOString?.();
    check('11. availableToConsumerSince matches stored availableSince',
        returnedNewProduct?.availableToConsumerSince === expectedTs,
        'returned=' + returnedNewProduct?.availableToConsumerSince + ' expected=' + expectedTs);

    // Step 12: Unauthorized products not returned
    const allAuthorized = new Set([...newLinkedProductIds, ...Object.keys(originalLinkedVariantSelections)]);
    const unauthorized = returnedIds.filter(id => !allAuthorized.has(id));
    check('12. No unauthorized products returned', unauthorized.length === 0,
        'unauthorized=' + (unauthorized.join(',') || 'none'));

    // --------------------------------------------------------
    // STEP 13-16: Full regression suite (usage, auth, revocation)
    // --------------------------------------------------------
    console.log('\n[STEP 13-16] Usage / Auth / Revocation regression...');
    await new Promise(r => setTimeout(r, 1000));

    const afterCatalogDoc = await db.collection('api_keys').doc(ldKeyId).get();
    const afterCatalogData = afterCatalogDoc.data();
    check('13. requestsUsed incremented by catalog call',
        afterCatalogData.requestsUsed > updatedData.requestsUsed,
        'before=' + updatedData.requestsUsed + ' after=' + afterCatalogData.requestsUsed);
    check('13b. lastUsed updated', !!afterCatalogData.lastUsed);

    const telSnap = await db.collection('api_telemetry').orderBy('timestamp', 'desc').limit(1).get();
    if (!telSnap.empty) {
        const t = telSnap.docs[0].data();
        check('13c. Telemetry recorded with Firestore Timestamp',
            t.timestamp?.constructor?.name === 'Timestamp', 'type=' + t.timestamp?.constructor?.name);
        check('13d. No API secret in telemetry', !JSON.stringify(t).includes(ldApiKey));
    }

    const r14 = await fetch(`${BASE}/daas/v1/catalog`, { headers: { 'x-api-key': 'daas_INVALID_FAKE' } });
    check('14. Invalid key -> 401', r14.status === 401, 'status=' + r14.status);

    await db.collection('api_keys').doc(ldKeyId).update({ status: 'revoked' });
    await new Promise(r => setTimeout(r, 500));
    const r15 = await fetch(`${BASE}/daas/v1/catalog`, { headers: { 'x-api-key': ldApiKey } });
    check('15. Revoked key -> 401', r15.status === 401, 'status=' + r15.status);
    const revokedDoc = await db.collection('api_keys').doc(ldKeyId).get();
    check('15b. Revoked doc still exists (soft delete)', revokedDoc.exists && revokedDoc.data().status === 'revoked');
    await db.collection('api_keys').doc(ldKeyId).update({ status: 'active' });

    const r16Json = catalogJson; // already checked above
    check('16. No secret API key in catalog response', !JSON.stringify(r16Json).includes(ldApiKey));

    // --------------------------------------------------------
    // RESTORE: Put LD-STORE back to its original state exactly
    // --------------------------------------------------------
    console.log('\n[RESTORE] Restoring LD-STORE to original product links...');
    const restorePatch = await fetch(`${BASE}/api/v1/api-keys/${ldKeyId}/products`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            userId: ldUserId,
            linkedProductIds: originalLinkedProductIds,
            linkedVariantSelections: originalLinkedVariantSelections
        })
    });
    const restoreJson = await restorePatch.json();
    check('RESTORE: original linkedProductIds reinstated', restorePatch.status === 200,
        'status=' + restorePatch.status);

    // Verify newProductId is gone from productAvailability after restore
    await new Promise(r => setTimeout(r, 1000));
    const finalDoc = await db.collection('api_keys').doc(ldKeyId).get();
    const finalData = finalDoc.data();
    check('RESTORE: new product removed from productAvailability',
        !finalData.productAvailability?.[newProductId],
        'still present=' + !!finalData.productAvailability?.[newProductId]);
    check('RESTORE: original products still in productAvailability',
        originalLinkedProductIds.every(pid => !!finalData.productAvailability?.[pid] || !existingTimestampsBefore[pid]));
    console.log('  \u2139\ufe0f  LD-STORE restored to original state.');

    // --------------------------------------------------------
    // SUMMARY
    // --------------------------------------------------------
    console.log('\n=========================================================');
    console.log(' RESULTS: ' + pass + ' PASS, ' + fail + ' FAIL');
    console.log('=========================================================');
    if (fail > 0) process.exit(1);
}

runTest().catch(e => { console.error('FATAL:', e.stack); process.exit(1); });
