import { initializeApp, cert, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { readFileSync } from 'fs';

const serviceAccount = JSON.parse(readFileSync('./service-account.json', 'utf8'));
if (!getApps().length) {
  initializeApp({ credential: cert(serviceAccount) });
}
const db = getFirestore();

async function check() {
  const users = await db.collection('users').count().get();
  console.log('Total users:', users.data().count);
  
  const auditLogs = await db.collection('audit_logs').count().get();
  console.log('Total audit logs:', auditLogs.data().count);
  
  const requests = await db.collection('product_requests').where('status', '==', 'pending').count().get();
  console.log('Pending product requests:', requests.data().count);
  
  const apiUsage = await db.collection('api_usage_logs').count().get();
  console.log('Total API usage logs:', apiUsage.data().count);
  
  process.exit(0);
}
check();
