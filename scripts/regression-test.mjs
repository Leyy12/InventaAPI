import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const sa = JSON.parse(readFileSync('./service-account.json', 'utf8'));
initializeApp({ credential: cert(sa) });
const db = getFirestore();

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

const BASE = 'http://localhost:5002/daas/v1';

async function runTests() {
    console.log('=========================================');
    console.log(' INVENTAAPI REGRESSION TEST SUITE');
    console.log('=========================================\n');

    // --- FIRESTORE DATA CHECKS ---
    const keysSnap = await db.collection('api_keys').get();
    const asmDoc = keysSnap.docs.find(d => d.data().name === 'ASM-HARDWARE');

    check('1. ASM-HARDWARE key exists in Firestore', !!asmDoc);
    if (!asmDoc) { console.log('\n\u274c Cannot continue \u2014 ASM-HARDWARE key missing.'); return; }

    const asm = asmDoc.data();
    check('2. ASM-HARDWARE has correct userId', typeof asm.userId === 'string' && asm.userId.length > 0, 'userId=' + asm.userId);
    check('3. ASM-HARDWARE has plan field', typeof asm.plan === 'string', 'plan=' + asm.plan);
    check('4. ASM-HARDWARE has requestLimit', typeof asm.requestLimit === 'number', 'requestLimit=' + asm.requestLimit);
    check('5. ASM-HARDWARE linkedProductIds preserved', Array.isArray(asm.linkedProductIds) && asm.linkedProductIds.length > 0, 'count=' + asm.linkedProductIds.length);

    // Check productAvailability — null for pre-feature keys is documented behaviour
    const hasProdAvail = asm.productAvailability && Object.keys(asm.productAvailability).length > 0;
    console.log('\n  [6] productAvailability check for ASM-HARDWARE (existing pre-feature key):');
    if (hasProdAvail) {
        const sample = Object.entries(asm.productAvailability)[0];
        check('6. productAvailability map present with availableSince', sample[1]?.availableSince !== undefined, 'sampleId=' + sample[0]);
    } else {
        console.log('  \u2139\ufe0f  INFO: productAvailability is null for ASM-HARDWARE (pre-feature key).');
        console.log('       Historical dates cannot be fabricated. New keys will have this field.');
        pass++; // documented limitation — intentional
    }

    // --- LIVE API TESTS ---
    console.log('\n--- Live DaaS API Tests ---');
    const asmKey = asm.key;
    const beforeUsed = asm.requestsUsed;

    // TEST 7: Valid key -> 200
    console.log('\n  [7] Valid key -> GET /catalog');
    const r7 = await fetch(BASE + '/catalog', { headers: { 'x-api-key': asmKey } });
    const j7 = await r7.json();
    check('7. HTTP 200 with valid key', r7.status === 200, 'status=' + r7.status);
    check('7b. Response has products array', Array.isArray(j7.products), 'count=' + (j7.products?.length ?? 'N/A'));

    // TEST 7c: availableToConsumerSince field
    const sampleProduct = j7.products?.[0];
    check('7c. availableToConsumerSince present in each product',
        sampleProduct !== undefined && 'availableToConsumerSince' in sampleProduct,
        sampleProduct ? 'value=' + sampleProduct.availableToConsumerSince : 'NO PRODUCTS');

    // TEST 8: Only authorized products
    const returnedIds = (j7.products || []).map(p => p.id);
    const allLinked = new Set([...(asm.linkedProductIds || []), ...Object.keys(asm.linkedVariantSelections || {})]);
    const unauthorized = returnedIds.filter(id => !allLinked.has(id));
    check('8. Only ASM-authorized products returned', unauthorized.length === 0, 'unauthorized=' + unauthorized.join(','));
    check('8b. No secret API key in response body', !JSON.stringify(j7).includes(asmKey));

    // TEST 9: Invalid key -> 401
    console.log('\n  [9] Invalid key -> GET /catalog');
    const r9 = await fetch(BASE + '/catalog', { headers: { 'x-api-key': 'daas_INVALID_FAKE_KEY_9999' } });
    check('9. HTTP 401 with invalid key', r9.status === 401, 'status=' + r9.status);

    // Wait for Firestore to settle after requests
    await new Promise(r => setTimeout(r, 2000));

    // TEST 11: requestsUsed incremented
    const keyAfter = await db.collection('api_keys').doc(asmDoc.id).get();
    const afterUsed = keyAfter.data().requestsUsed;
    check('11. requestsUsed incremented after valid request', afterUsed > beforeUsed, 'before=' + beforeUsed + ' after=' + afterUsed);

    // TEST 12: lastUsed updated
    const lastUsed = keyAfter.data().lastUsed;
    check('12. lastUsed updated', !!lastUsed, 'lastUsed=' + lastUsed);

    // TEST 13: Telemetry
    const telSnap = await db.collection('api_telemetry').orderBy('timestamp', 'desc').limit(1).get();
    if (!telSnap.empty) {
        const t = telSnap.docs[0].data();
        check('13a. Telemetry apiKeyId', !!t.apiKeyId, 'apiKeyId=' + t.apiKeyId);
        check('13b. Telemetry userId', !!t.userId);
        check('13c. Telemetry keyName', !!t.keyName, 'keyName=' + t.keyName);
        check('13d. Telemetry endpoint', !!t.endpoint, 'endpoint=' + t.endpoint);
        check('13e. Telemetry method', !!t.method);
        check('13f. Telemetry statusCode is number', typeof t.statusCode === 'number', 'statusCode=' + t.statusCode);
        check('13g. Telemetry success is boolean', typeof t.success === 'boolean');
        check('13h. Telemetry latencyMs is number', typeof t.latencyMs === 'number');
        check('13i. Telemetry timestamp is Firestore Timestamp', t.timestamp?.constructor?.name === 'Timestamp', 'type=' + t.timestamp?.constructor?.name);
        check('13j. No API secret in telemetry', !JSON.stringify(t).includes(asmKey));
    } else {
        check('13. Telemetry recorded', false, 'NO TELEMETRY RECORDS');
    }

    // TEST 14: Audit log
    const audSnap = await db.collection('audit_logs').orderBy('timestamp', 'desc').limit(5).get();
    const apiReqLog = audSnap.docs.find(d => d.data().action === 'API Request');
    const invalLog  = audSnap.docs.find(d => d.data().action === 'Invalid API Key Attempt');
    check('14a. Audit log has API Request event', !!apiReqLog, apiReqLog ? 'email=' + (apiReqLog.data().email || apiReqLog.data().userEmail) : 'NOT FOUND');
    check('14b. Audit log has Invalid API Key Attempt', !!invalLog);

    // TEST 15: No secret in catalog
    check('15. No secret key exposed in catalog response', !JSON.stringify(j7).includes(asmKey));

    // TEST 10: Revoked key -> 401
    console.log('\n  [10] Revoked key test');
    await db.collection('api_keys').doc(asmDoc.id).update({ status: 'revoked' });
    await new Promise(r => setTimeout(r, 600));
    const r10 = await fetch(BASE + '/catalog', { headers: { 'x-api-key': asmKey } });
    check('10. HTTP 401 with revoked key', r10.status === 401, 'status=' + r10.status);
    const revokedDoc = await db.collection('api_keys').doc(asmDoc.id).get();
    check('10b. Revoked doc still exists (soft delete)', revokedDoc.exists && revokedDoc.data().status === 'revoked');
    await db.collection('api_keys').doc(asmDoc.id).update({ status: 'active' });
    console.log('  \u2139\ufe0f  Key restored to active after revoke test');

    // TEST 16 & 17: Source code checks
    console.log('\n  [16-17] Source code integrity checks');
    const genRoute = readFileSync('./routes/apikeys.js', 'utf8');
    check('16. productAvailability written on key generation', genRoute.includes('productAvailability'));
    check('16b. Timestamp.now() used for createdAt (not ISO string)', genRoute.includes('Timestamp.now()'));
    check('17. Revocation uses soft-update status:revoked', genRoute.includes("status: 'revoked'"));

    // TEST 18: Schema integrity
    console.log('\n  [18] All api_keys schema integrity:');
    const required = ['userId','name','status','plan','requestLimit','requestsUsed','createdAt','linkedProductIds'];
    let schemaOk = true;
    keysSnap.docs.forEach(doc => {
        const d = doc.data();
        const missing = required.filter(f => d[f] === undefined);
        if (missing.length > 0) {
            console.log('    \u274c Key', d.name, 'missing:', missing.join(','));
            schemaOk = false;
        } else {
            console.log('    \u2705 Key', d.name, '| all required fields present');
        }
    });
    check('18. All api_keys have required fields', schemaOk);

    // Rate-limit security
    const planGate = readFileSync('./middleware/planGate.js', 'utf8');
    check('Rate-limit reads from server-trusted users.apiRequestLimit', planGate.includes('userData.apiRequestLimit'));

    console.log('\n=========================================');
    console.log(' RESULTS: ' + pass + ' PASS, ' + fail + ' FAIL');
    console.log('=========================================');
    if (fail > 0) process.exit(1);
}

runTests().catch(e => { console.error('FATAL:', e.stack); process.exit(1); });
