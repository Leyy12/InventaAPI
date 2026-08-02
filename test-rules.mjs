import { initializeTestEnvironment, assertSucceeds } from '@firebase/rules-unit-testing';
import { readFileSync } from 'fs';
import { setDoc, updateDoc, doc } from 'firebase/firestore';

async function runTest() {
  const projectId = 'demo-rules-test-' + Date.now();
  let testEnv;

  try {
    testEnv = await initializeTestEnvironment({
      projectId,
      firestore: {
        rules: readFileSync('FINAL_FIRESTORE_RULES_TO_PUBLISH.rules', 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });

    console.log("=== RUNNING TEST FOR MISSING subscriptionExpiresAt ===");

    // 1. Create a user context
    const aliceContext = testEnv.authenticatedContext('alice', { email: 'alice@example.com' });
    const firestore = aliceContext.firestore();

    // 2. We use testEnv.withSecurityRulesDisabled to set up the initial document
    // because create rule requires specific fields which we can bypass just to simulate
    // an existing "old" user document that lacks subscriptionExpiresAt.
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const adminFs = context.firestore();
      await setDoc(doc(adminFs, 'users', 'alice'), {
        uid: 'alice',
        role: 'Developer',
        plan: 'Starter',
        apiRequestLimit: 50,
        businessName: 'Old Business'
        // Notice: NO subscriptionExpiresAt field here!
      });
    });
    console.log("✅ Created test user 'alice' WITHOUT subscriptionExpiresAt field.");

    // 3. Try to update businessName using the authenticated client (Subject to rules)
    console.log("Attempting to update businessName to 'New Business'...");
    
    await assertSucceeds(
      updateDoc(doc(firestore, 'users', 'alice'), {
        businessName: 'New Business'
      })
    );
    console.log("✅ SUCCESS! The update rule PASSED even when subscriptionExpiresAt was completely missing.");
    
  } catch (error) {
    console.error("❌ TEST FAILED:", error.message);
    process.exit(1);
  } finally {
    if (testEnv) {
      await testEnv.cleanup();
    }
  }
}

runTest();
