import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { PRO_PURCHASE, PRO_MAX_PURCHASE, paymentConfiguration, matchesPurchase,
  settlementForPurchase } from '../../../services/payment-contract.js';
import { createPaymentHandlers } from '../../../services/payment-checkout.js';
import { checkoutPayload, createPaymongoCheckout, expirePaymongoCheckout } from '../../../services/paymongo-checkout.js';
import { createPaymentWebhook } from '../../../services/payment-webhook.js';
import { memoryFirestore, invoke } from './memory-firestore.mjs';

const now = new Date('2026-09-20T10:00:00.000Z');
const config = { mode: 'test', secretKey: 'sk_test_syntheticOnly', webhookSecret: 'synthetic-signing-secret-not-real', dashboardUrl: 'https://customer.example' };
const orderId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const orderPath = `payment_orders/${orderId}`;
const paymentPath = 'transactions/paymongo_test_pay_abc123';
const customer = { uid: 'owner', role: 'Developer', plan: 'Free', apiRequestLimit: 50 };
const providerOrder = () => ({ id: orderId, ...PRO_PURCHASE, mode: 'test', idempotencyKey: `checkout-test-${orderId}`,
  providerRequestBody: JSON.stringify(checkoutPayload({ id: orderId, ...PRO_PURCHASE }, config.dashboardUrl)) });
function setup(options = {}) {
  const db = memoryFirestore({ 'users/owner': customer, 'users/stranger': { ...customer, uid: 'stranger' } });
  let calls = 0, dbCalls = 0;
  const reports = [];
  const getDb = () => { dbCalls++; return db; };
  const getConfig = () => config;
  const session = { sessionId: 'cs_abc123', paymentIntentId: 'pi_abc123', checkoutUrl: 'https://checkout.paymongo.com/abc123' };
  const handlers = createPaymentHandlers({ getDb, getConfig, clock: () => now, newOrderId: () => orderId,
    verifyIdToken: async (token, revoked) => {
      assert.equal(revoked, true);
      if (token !== 'owner-token') throw new Error('invalid');
      return { uid: 'owner' };
    },
    createSession: async ({ order }) => {
      calls++;
      assert.equal(db.read(orderPath).state, 'creating', 'durable order before provider request');
      assert.equal(order.userId, 'owner');
      if (options.providerFailure) throw new Error('uncertain provider result');
      if (options.bindingFailure) db.failWrite = 'payment_sessions';
      return session;
    }, report: issue => reports.push(issue), ...options.handlers });
  const webhook = createPaymentWebhook({ getDb, getConfig, clock: () => now, report: issue => reports.push(issue) });
  return { db, ...handlers, webhook, session, reports, calls: () => calls, dbCalls: () => dbCalls };
}
async function ready() {
  const env = setup();
  assert.equal((await invoke(env.checkout)).statusCode, 200);
  return env;
}
function fixture() {
  return { data: { id: 'evt_abc123', type: 'event', attributes: {
    type: 'checkout_session.payment.paid', livemode: false,
    data: { id: 'cs_abc123', type: 'checkout_session', attributes: {
      status: 'active', livemode: false, reference_number: orderId,
      metadata: { userId: 'stranger', email: 'untrusted@example.test', plan: 'Enterprise' },
      line_items: [{ amount: 149900, currency: 'PHP', quantity: 1 }],
      payment_intent: { id: 'pi_abc123', type: 'payment_intent', attributes: { amount: 149900, currency: 'PHP', livemode: false, status: 'succeeded' } },
      payments: [{ id: 'pay_abc123', type: 'payment', attributes: { amount: 149900, currency: 'PHP', livemode: false,
        payment_intent_id: 'pi_abc123', status: 'paid', source: { type: 'qrph' }, refunds: [], disputed: false } }],
    } },
  } } };
}
function signed(event = fixture(), timestamp = Math.floor(now.getTime() / 1000), secret = config.webhookSecret) {
  const rawBody = JSON.stringify(event);
  const digest = createHmac('sha256', secret).update(`${timestamp}.${rawBody}`).digest('hex');
  return { rawBody, headers: { 'paymongo-signature': `t=${timestamp},te=${digest},li=` } };
}
const attrs = event => event.data.attributes.data.attributes;
const unchanged = (env, before) => { assert.deepEqual(env.db.dump(), before); assert.equal(env.db.userWrites, 0); };

const liveBilling = (extra = {}) => paymentConfiguration({ mode: 'live', nodeEnv: 'production',
  secretKey: 'sk_live_SYNTHETIC_ONLY', webhookSecret: config.webhookSecret, dashboardUrl: config.dashboardUrl,
  globalTestBilling: 'true', globalTestAmountCentavos: '500', ...extra });
function temporaryBillingSetup(extra = {}) {
  const billing = liveBilling();
  const env = setup({ handlers: { getConfig: () => billing, ...extra } });
  return { ...env, billing, webhook: createPaymentWebhook({getDb:()=>env.db,getConfig:()=>billing,clock:()=>now}) };
}
function temporaryPaid(amount = 500) {
  const event = fixture();
  event.data.attributes.livemode = true;
  for (const object of [attrs(event), attrs(event).payment_intent.attributes, attrs(event).payments[0].attributes]) object.livemode = true;
  for (const object of [attrs(event).line_items[0], attrs(event).payment_intent.attributes, attrs(event).payments[0].attributes]) object.amount = amount;
  return event;
}
function signedLive(event = temporaryPaid()) {
  const input = signed(event);
  const timestamp = Math.floor(now.getTime()/1000);
  const digest = createHmac('sha256',config.webhookSecret).update(`${timestamp}.${input.rawBody}`).digest('hex');
  input.headers['paymongo-signature'] = `t=${timestamp},te=,li=${digest}`;
  return input;
}

test('temporary billing is explicit, exactly 500, Live-only and defaults off', () => {
  assert.equal(liveBilling().globalTestBilling, true);
  for (const flag of [undefined, 'false']) {
    const disabled = liveBilling({ globalTestBilling: flag });
    assert.equal(disabled.globalTestBilling, false);
    assert.deepEqual(settlementForPurchase(PRO_PURCHASE, disabled), PRO_PURCHASE);
  }
  for (const extra of [{ globalTestBilling: 'TRUE' }, { globalTestBilling: true },
    { globalTestAmountCentavos: undefined }, { globalTestAmountCentavos: '501' },
    { globalTestAmountCentavos: 500 }, { globalTestAmountCentavos: '500.0' },
    { mode: 'test', secretKey: 'sk_test_SYNTHETIC_ONLY' }]) {
    assert.throws(() => liveBilling(extra), { code: 'PAYMENT_CONFIG' });
  }
});

for (const purchase of [PRO_PURCHASE, PRO_MAX_PURCHASE]) {
  test(`global Live billing ${purchase.plan}: canonical display terms unchanged; saved/provider charge 500`, async () => {
    assert.equal(purchase.amount, purchase.planId === 'pro' ? 149900 : 499900);
    const env = temporaryBillingSetup();
    const result = await invoke(env.checkout, { body: { plan: purchase.planId, amount: purchase.amount } });
    assert.equal(result.statusCode, 200); assert.equal(result.body.amount, 500);
    const order = env.db.read(orderPath), payload = JSON.parse(order.providerRequestBody).data.attributes;
    assert.equal(order.listAmount, purchase.amount);
    assert.equal(order.billingProfile, 'global_live_test_v1'); assert.equal(order.amount, 500);
    assert.equal(order.planId, purchase.planId); assert.equal(order.plan, purchase.plan);
    assert.equal(order.apiRequestLimit, purchase.apiRequestLimit); assert.equal(order.durationDays, 30);
    assert.equal(order.mode, 'live'); assert.equal(order.currency, 'PHP');
    assert.equal(matchesPurchase(order), true);
    assert.equal(payload.line_items[0].amount, 500); assert.equal(payload.line_items[0].currency, 'PHP');
    assert.deepEqual(payload.payment_method_types, ['qrph']);
    assert.equal(payload.metadata.planId, purchase.planId);
    assert.equal(payload.line_items[0].name, `InventaAPI ${purchase.plan} Plan`);
    for (const mutate of [o => {o.amount = 501;}, o => {o.listAmount = 500;}, o => {o.mode = 'test';},
      o => {delete o.billingProfile;}, o => {delete o.planId;}, o => {o.billingProfile = 'arbitrary_discount';},
      o => {o.apiRequestLimit = -1;}]) {
      const invalid = structuredClone(order); mutate(invalid); assert.equal(matchesPurchase(invalid), false);
    }
  });

  test(`global Live billing ${purchase.plan}: signed 500 settlement grants exact entitlement once`, async () => {
    const env = temporaryBillingSetup();
    assert.equal((await invoke(env.checkout, { body: { plan: purchase.planId } })).statusCode, 200);
    const first = await invoke(env.webhook, signedLive());
    assert.equal(first.statusCode, 200); assert.equal(first.body.processed, true);
    const account = env.db.read('users/owner');
    assert.equal(account.plan, purchase.plan); assert.equal(account.apiRequestLimit, purchase.apiRequestLimit);
    assert.equal(account.subscriptionExpiresAt, '2026-10-20T10:00:00.000Z');
    assert.equal(env.db.read('transactions/paymongo_live_pay_abc123').amount, 500);
    assert.equal(env.db.read(orderPath).state, 'processed');
    const before = env.db.dump();
    const again = await invoke(env.webhook, signedLive());
    assert.equal(again.statusCode, 200); assert.equal(again.body.duplicate, true);
    assert.deepEqual(env.db.dump(), before); assert.equal(env.db.userWrites, 1);
    assert.equal((await invoke(env.status, { query: {orderId} })).body.paymentConfirmed, true);
  });

  for (const amount of [499, 501, purchase.amount]) test(`global Live billing ${purchase.plan}: wrong saved settlement ${amount} never grants`, async () => {
    const env = temporaryBillingSetup();
    await invoke(env.checkout, {body: {plan: purchase.planId}});
    const before = env.db.dump();
    const result = await invoke(env.webhook, signedLive(temporaryPaid(amount)));
    assert.equal(result.statusCode, 409); assert.equal(result.body.code, 'ORDER_MISMATCH');
    unchanged(env, before);
  });

  test(`global Live billing ${purchase.plan}: pending full-price QR Ph requires verified expiration, not reuse`, async () => {
    let expired = 0;
    const env = setup({handlers: {getConfig: () => liveBilling({globalTestBilling:'false'}),
      expireSession: async ({order}) => {expired++; assert.equal(order.amount,purchase.amount);
        return {sessionId:order.sessionId,status:'expired',unpaid:true};}}});
    await invoke(env.checkout,{body:{plan:purchase.planId}});
    const original=env.db.read(orderPath), newId='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    let created=0;
    const next=createPaymentHandlers({getDb:()=>env.db,verifyIdToken:async()=>({uid:'owner'}),
      getConfig:()=>liveBilling(),clock:()=>now,newOrderId:()=>newId,
      expireSession:async({order})=>{expired++;assert.equal(order.amount,purchase.amount);
        assert.equal(env.db.read(orderPath).state,'expiring');return {sessionId:order.sessionId,status:'expired',unpaid:true};},
      createSession:async({order})=>{created++; assert.equal(expired,1); assert.equal(order.amount,500);
        return {sessionId:'cs_new500',paymentIntentId:'pi_new500',checkoutUrl:'https://checkout.paymongo.com/new500'};}});
    const results=await Promise.all(Array.from({length:20},()=>invoke(next.checkout,{body:{plan:purchase.planId}})));
    assert.ok(results.every(r=>[200,409].includes(r.statusCode)));
    assert.equal(created,1); assert.equal(expired,1);
    assert.equal(env.db.read(orderPath).state,'superseded'); assert.equal(env.db.read(orderPath).amount,purchase.amount);
    assert.equal(env.db.read(`payment_orders/${newId}`).amount,500);
    assert.equal(env.db.read('payment_checkout_locks/owner').orderId,newId);
    assert.equal((await invoke(next.checkout,{body:{plan:purchase.planId}})).body.sessionId,'cs_new500');
    assert.equal(created,1);
    const obsolete=temporaryPaid(purchase.amount);
    const webhook=createPaymentWebhook({getDb:()=>env.db,getConfig:()=>liveBilling(),clock:()=>now});
    const response=await invoke(webhook,signedLive(obsolete));
    assert.equal(response.statusCode,200); assert.equal(response.body.reviewRequired,true);
    assert.equal(env.db.userWrites,0); assert.equal(env.db.read('users/owner').plan,'Free');
    assert.equal(env.db.read(orderPath).amount,original.amount);
    assert.equal((await invoke(webhook,signedLive(obsolete))).body.duplicate,true);
  });
}

for (const body of [{amount:500}, {amount:1}, {billingProfile:'global_live_test_v1'}, {listAmount:500},
  {globalTestBilling:true}, {globalTestAmountCentavos:500}, {settlementAmount:500}, {expectedAmount:500},
  {currency:'USD'}, {discountAmount:149400}]) test(`global Live billing: browser cannot select settlement ${JSON.stringify(body)}`,async()=>{
  const env=temporaryBillingSetup(); const before=env.db.dump();
  assert.equal((await invoke(env.checkout,{body})).statusCode,400);
  assert.equal(env.calls(),0);unchanged(env,before);
});

test('global Live billing: webhook accepts saved 500 order after operator disables discount',async()=>{
  const env=temporaryBillingSetup();await invoke(env.checkout);
  const webhook=createPaymentWebhook({getDb:()=>env.db,getConfig:()=>liveBilling({globalTestBilling:'false'}),clock:()=>now});
  assert.equal((await invoke(webhook,signedLive())).body.processed,true);
  assert.equal(env.db.read('users/owner').plan,'Pro');
});

test('global Live billing: expiration ambiguity preserves full-price intent and creates no new session',async()=>{
  const env=setup({handlers:{getConfig:()=>liveBilling({globalTestBilling:'false'})}});await invoke(env.checkout);
  const next=createPaymentHandlers({getDb:()=>env.db,verifyIdToken:async()=>({uid:'owner'}),getConfig:()=>liveBilling(),
    clock:()=>now,newOrderId:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    expireSession:async()=>{throw Error('provider uncertain');},createSession:async()=>{throw Error('must not create');}});
  assert.equal((await invoke(next.checkout)).body.code,'CHECKOUT_REVIEW');
  assert.equal(env.db.read(orderPath).state,'expiring');assert.equal(env.db.read(orderPath).amount,149900);
  assert.equal(env.db.read('payment_checkout_locks/owner').orderId,orderId);assert.equal(env.db.userWrites,0);
});

test('global Live billing: signed discounted event still requires the current account/order/session intent',async()=>{
  const env=temporaryBillingSetup();await invoke(env.checkout);
  env.db.seed('payment_checkout_locks/owner',{orderId:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',sessionId:'cs_newer',mode:'live'});
  const first=await invoke(env.webhook,signedLive());
  assert.equal(first.statusCode,200);assert.equal(first.body.reviewRequired,true);
  assert.equal(env.db.userWrites,0);
  assert.equal(env.db.read('transactions/paymongo_live_pay_abc123').entitlementGranted,false);
  assert.equal((await invoke(env.webhook,signedLive())).body.duplicate,true);
});

for(const fault of ['signature','livemode','currency','account','intent']) test(`global Live billing: ${fault} mismatch cannot fulfill`,async()=>{
  const env=temporaryBillingSetup();await invoke(env.checkout);
  const event=temporaryPaid();
  if(fault==='livemode')event.data.attributes.livemode=false;
  if(fault==='currency')for(const o of [attrs(event).line_items[0],attrs(event).payment_intent.attributes,attrs(event).payments[0].attributes])o.currency='USD';
  if(fault==='account')env.db.seed(orderPath,{...env.db.read(orderPath),userId:'stranger'});
  if(fault==='intent')attrs(event).payments[0].attributes.payment_intent_id='pi_wrong';
  const input=signedLive(event);
  if(fault==='signature')input.headers['paymongo-signature']=input.headers['paymongo-signature'].replace(/li=[a-f0-9]+/,`li=${'0'.repeat(64)}`);
  const before=env.db.dump(), result=await invoke(env.webhook,input);
  assert.ok(result.statusCode>=400);unchanged(env,before);
});

for(const purchase of [PRO_PURCHASE,PRO_MAX_PURCHASE]) test(`global Live billing ${purchase.plan}: real v1 adapter sends exact persisted 500 QR Ph payload`,async()=>{
  const billing=liveBilling(), order={id:orderId,...settlementForPurchase(purchase,billing),mode:'live',idempotencyKey:`checkout-live-${orderId}`};
  order.providerRequestBody=JSON.stringify(checkoutPayload(order,billing.dashboardUrl));
  let calls=0;
  const session=await createPaymongoCheckout({config:billing,order,request:async(url,input)=>{
    calls++;assert.equal(url,'https://api.paymongo.com/v1/checkout_sessions');assert.equal(input.method,'POST');
    assert.equal(input.body,order.providerRequestBody);assert.equal(input.headers['Idempotency-Key'],order.idempotencyKey);
    const body=JSON.parse(input.body).data.attributes;
    assert.equal(body.line_items[0].amount,500);assert.deepEqual(body.payment_method_types,['qrph']);
    return {ok:true,json:async()=>({data:{id:'cs_abc123',type:'checkout_session',attributes:{livemode:true,status:'active',
      payment_intent:{id:'pi_abc123'},payment_method_types:['qrph'],checkout_url:'https://checkout.paymongo.com/abc123'}}})};
  }});
  assert.equal(calls,1);assert.equal(session.sessionId,'cs_abc123');
});

test('temporary billing rollback cannot reuse a pending 500 session as full-price checkout',async()=>{
  const env=temporaryBillingSetup();await invoke(env.checkout);
  let expires=0;
  const next=createPaymentHandlers({getDb:()=>env.db,verifyIdToken:async()=>({uid:'owner'}),
    getConfig:()=>liveBilling({globalTestBilling:'false'}),clock:()=>now,newOrderId:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    expireSession:async({order})=>{expires++;assert.equal(order.amount,500);return {sessionId:order.sessionId,status:'expired',unpaid:true};},
    createSession:async({order})=>{assert.equal(order.amount,149900);assert.equal(order.billingProfile,undefined);
      return {sessionId:'cs_fullprice',paymentIntentId:'pi_fullprice',checkoutUrl:'https://checkout.paymongo.com/fullprice'};}});
  const result=await invoke(next.checkout);assert.equal(result.statusCode,200);assert.equal(result.body.amount,149900);
  assert.equal(expires,1);assert.equal(env.db.read(orderPath).state,'superseded');
});

test('uncertain full-price provider creation cannot replay an immutable request at the new 500 price',async()=>{
  const env=setup({providerFailure:true,handlers:{getConfig:()=>liveBilling({globalTestBilling:'false'})}});
  assert.equal((await invoke(env.checkout)).statusCode,503);
  const before=env.db.dump();let calls=0;
  const next=createPaymentHandlers({getDb:()=>env.db,verifyIdToken:async()=>({uid:'owner'}),getConfig:()=>liveBilling(),
    clock:()=>new Date(now.getTime()+60001),newOrderId:()=> 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    createSession:async()=>{calls++;throw Error('must not replay');}});
  assert.equal((await invoke(next.checkout)).body.code,'CHECKOUT_REVIEW');assert.equal(calls,0);unchanged(env,before);
});

for (const purchase of [PRO_PURCHASE, PRO_MAX_PURCHASE]) {
  test(`QR Ph checkout: ${purchase.plan} keeps canonical price, PHP, term and quota`, async () => {
    const env = setup();
    assert.equal((await invoke(env.checkout, { body: { plan: purchase.planId } })).statusCode, 200);
    const order = env.db.read(orderPath);
    const payload = JSON.parse(order.providerRequestBody).data.attributes;
    assert.deepEqual(payload.payment_method_types, ['qrph']);
    assert.equal(payload.line_items[0].amount, purchase.planId === 'pro' ? 149900 : 499900);
    assert.equal(payload.line_items[0].currency, 'PHP');
    assert.equal(order.durationDays, 30);
    assert.equal(order.apiRequestLimit, purchase.planId === 'pro' ? 5000 : null);
    assert.equal(order.userId, 'owner');
  });

  for (const mode of ['test', 'live']) test(`QR Ph fulfillment: ${purchase.plan}/${mode} grants atomically once`, async () => {
    const env = setup();
    assert.equal((await invoke(env.checkout, { body: { plan: purchase.planId } })).statusCode, 200);
    const event = fixture();
    event.data.attributes.livemode = mode === 'live';
    for (const object of [attrs(event), attrs(event).payment_intent.attributes, attrs(event).payments[0].attributes]) {
      object.livemode = mode === 'live';
    }
    for (const object of [attrs(event).line_items[0], attrs(event).payment_intent.attributes, attrs(event).payments[0].attributes]) {
      object.amount = purchase.amount;
    }
    env.db.seed(orderPath, { ...env.db.read(orderPath), mode });
    env.db.seed(`payment_sessions/${mode}_cs_abc123`, { ...env.db.read('payment_sessions/test_cs_abc123'), mode });
    env.db.seed('payment_checkout_locks/owner', { orderId, sessionId: 'cs_abc123', mode });
    const handler = createPaymentWebhook({ getDb: () => env.db, getConfig: () => ({ ...config, mode }), clock: () => now });
    const input = signed(event);
    if (mode === 'live') input.headers['paymongo-signature'] = input.headers['paymongo-signature'].replace(',li=', '').replace(',te=', ',te=,li=');
    assert.equal((await invoke(handler, input)).body.processed, true);
    assert.equal((await invoke(handler, input)).body.duplicate, true);
    assert.equal(env.db.userWrites, 1);
    const account = env.db.read('users/owner');
    assert.equal(account.plan, purchase.plan);
    assert.equal(account.apiRequestLimit, purchase.apiRequestLimit);
    assert.equal(account.subscriptionExpiresAt, '2026-10-20T10:00:00.000Z');
    assert.equal(env.db.read(`transactions/paymongo_${mode}_pay_abc123`).paymentMethod, 'qrph');
  });
}

test('historical GCash session still settles once through the same bound webhook pipeline', async () => {
  const env = await ready(); const event = fixture();
  attrs(event).payments[0].attributes.source.type = 'gcash';
  assert.equal((await invoke(env.webhook, signed(event))).body.processed, true);
  assert.equal((await invoke(env.webhook, signed(event))).body.duplicate, true);
  assert.equal(env.db.read(paymentPath).paymentMethod, 'gcash');
  assert.equal(env.db.userWrites, 1);
});

for (const [label, input] of Object.entries({ missing: { token: null }, malformed: { headers: { authorization: 'Bearer a b' } }, invalid: { token: 'bad' } })) {
  for (const operation of ['checkout', 'status']) test(`${operation}: ${label} authentication rejected before database access`, async () => {
    const env = setup();
    assert.equal((await invoke(env[operation], input)).statusCode, 401);
    assert.equal(env.calls(), 0); assert.equal(env.dbCalls(), 0);
  });
}
test('checkout: valid Customer and matching legacy UID bind only decoded UID', async () => {
  const env = setup();
  const response = await invoke(env.checkout, { body: { userId: 'owner', userEmail: 'stranger@example.test' } });
  assert.equal(response.statusCode, 200); assert.equal(response.headers['Cache-Control'], 'no-store');
  assert.equal(env.db.read(orderPath).userId, 'owner');
  assert.equal(env.db.read(orderPath).amount, 149900); assert.equal(env.calls(), 1);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').orderId, orderId);
});
for (const body of [{ userId: 'stranger' }, { amount: 1 }, { currency: 'USD' }, { plan: 'Enterprise' }, { durationDays: 999 }, { apiRequestLimit: -1 }]) {
  test(`checkout: client terms cannot change authority ${JSON.stringify(body)}`, async () => {
    const env = setup();
    assert.ok((await invoke(env.checkout, { body })).statusCode >= 400);
    assert.equal(env.calls(), 0); assert.equal(env.db.read(orderPath), undefined);
  });
}
test('checkout: repeated and concurrent attempts create only one provider session', async () => {
  const env = setup();
  const results = await Promise.all(Array.from({ length: 15 }, () => invoke(env.checkout)));
  assert.ok(results.every(result => [200, 409].includes(result.statusCode)));
  assert.equal((await invoke(env.checkout)).body.sessionId, env.session.sessionId);
  assert.equal(env.calls(), 1); assert.ok(env.db.retries > 0);
});
for (const fault of ['providerFailure', 'bindingFailure']) test(`checkout: ${fault} holds future attempts, no grant`, async () => {
  const env = setup({ [fault]: true });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.db.read(orderPath).state, 'retryable');
  assert.equal((await invoke(env.checkout)).statusCode, 409);
  assert.equal(env.calls(), 1); assert.equal(env.db.userWrites, 0);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123'), undefined);
  assert.ok(env.reports.length);
  assert.ok((await invoke(env.webhook, signed())).statusCode >= 400);
});
test('checkout: intent-store failure makes no provider call', async () => {
  const env = setup(); env.db.failCommit = true;
  assert.equal((await invoke(env.checkout)).statusCode, 503); assert.equal(env.calls(), 0);
});
test('checkout: unexpected existing session binding cannot be overwritten', async () => {
  const env = setup(); env.db.seed('payment_sessions/test_cs_abc123', { orderId: 'another' });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').orderId, 'another');
});
test('checkout: unresolved Pro, unknown plans and non-customers fail closed', async () => {
  for (const override of [{ plan: 'Enterprise' }, { role: 'Admin' }, { uid: 'stranger' }, { plan: 'Pro' },
    { plan: 'Pro', subscriptionExpiresAt: '2099-01-01' }]) {
    const env = setup(); env.db.seed('users/owner', { ...customer, ...override });
    assert.ok((await invoke(env.checkout)).statusCode >= 400); assert.equal(env.calls(), 0);
  }
});
test('status: own account succeeds; forged UID and other order are denied', async () => {
  const env = await ready();
  assert.equal((await invoke(env.status)).body.plan, 'Upgrade Required');
  assert.equal((await invoke(env.status, { query: { userId: 'stranger' } })).statusCode, 403);
  env.db.seed(orderPath, { ...env.db.read(orderPath), userId: 'stranger' });
  assert.equal((await invoke(env.status, { query: { orderId } })).statusCode, 404);
});
test('status: redirect/order before fulfillment is not payment proof', async () => {
  const env = await ready();
  assert.equal((await invoke(env.status, { query: { orderId, payment: 'success' } })).body.paymentConfirmed, false);
  await invoke(env.webhook, signed());
  assert.equal((await invoke(env.status, { query: { orderId } })).body.paymentConfirmed, true);
  assert.equal((await invoke(env.status)).body.paymentConfirmed, false);
});
test('status: Phase 2B2 reports effective Free without mutating the account', async () => {
  const env = setup(); env.db.seed('users/owner', { ...customer, plan: 'Pro', subscriptionExpiresAt: '2020-01-01T00:00:00.000Z' });
  assert.equal((await invoke(env.status)).body.expired, true);
  assert.equal(env.db.read('users/owner').plan, 'Pro');
  assert.equal(env.db.read('users/owner').subscriptionExpiresAt, '2020-01-01T00:00:00.000Z');
});

test('provider client: fixed v1 URL, Basic secret username, fixed terms and server reference', async () => {
  let captured;
  const request = async (url, options) => {
    captured = { url, ...options };
    return { ok: true, json: async () => ({ data: { id: 'cs_abc123', type: 'checkout_session', attributes: {
      livemode: false, status: 'active', payment_method_types: ['qrph'], payment_intent: { id: 'pi_abc123' }, checkout_url: 'https://checkout.paymongo.com/abc123' } } }) };
  };
  await createPaymongoCheckout({ request, config, order: providerOrder() });
  assert.equal(captured.url, 'https://api.paymongo.com/v1/checkout_sessions');
  assert.equal(captured.headers.Authorization, `Basic ${Buffer.from(`${config.secretKey}:`).toString('base64')}`);
  assert.equal(captured.headers['Idempotency-Key'], `checkout-test-${orderId}`);
  assert.equal(captured.redirect, 'error');
  const payload = JSON.parse(captured.body).data.attributes;
  assert.equal(payload.reference_number, orderId); assert.equal(payload.metadata.userId, undefined);
  assert.equal(payload.line_items[0].amount, PRO_PURCHASE.amount);
  assert.equal(payload.line_items[0].currency, 'PHP');
  assert.equal(new URL(payload.success_url).searchParams.get('order'), orderId);
});
for (const override of [{ livemode: true }, { status: 'expired' }, { payment_intent: null }, { checkout_url: 'https://evil.example' },
  { checkout_url: 'https://checkout.paymongo.com.evil.example' }, { checkout_url: 'javascript:alert(1)' }]) {
  test(`provider client: malformed or wrong-mode response ${JSON.stringify(override)}`, async () => {
    await assert.rejects(createPaymongoCheckout({ config, order: providerOrder(), request: async () => ({ ok: true,
      json: async () => ({ data: { id: 'cs_abc123', type: 'checkout_session', attributes: {
        livemode: false, status: 'active', payment_method_types: ['qrph'], payment_intent: { id: 'pi_abc123' }, checkout_url: 'https://checkout.paymongo.com/abc', ...override } } }) }) }));
  });
}
for (const [secretKey, mode, accepted] of [['sk_test_synthetic', 'test', true], ['sk_live_synthetic', 'live', true],
  ['sk_test_synthetic', 'live', false], ['sk_live_synthetic', 'test', false], ['', 'test', false]]) {
  test(`configuration: ${mode}/${secretKey.split('_')[1] || 'missing'} mode`, () => {
    const action = () => paymentConfiguration({ ...config, secretKey, mode });
    if (accepted) assert.ok(action().mode); else assert.throws(action);
  });
}
test('signature: valid raw fixture grants only stored owner; body/metadata ignored', async () => {
  const env = await ready();
  const stranger = env.db.read('users/stranger');
  const response = await invoke(env.webhook, { ...signed(), body: { userId: 'stranger' } });
  assert.equal(response.statusCode, 200); assert.equal(response.body.duplicate, false);
  assert.equal(env.db.read('users/owner').plan, 'Pro');
  assert.equal(env.db.read('users/owner').apiRequestLimit, 5000);
  assert.equal(env.db.read('users/owner').subscriptionExpiresAt, '2026-10-20T10:00:00.000Z');
  assert.equal(env.db.read('users/owner').lastSubscribedAt, now.toISOString());
  assert.deepEqual(env.db.read('users/stranger'), stranger);
  assert.equal(env.db.read(paymentPath).status, 'paid');
});
for (const [name, mutate] of Object.entries({
  missing: input => { input.headers = {}; }, invalid: input => { input.headers['paymongo-signature'] = 't=1,te=bad'; },
  tampered: input => { input.rawBody += ' '; }, duplicate: input => { input.headers['paymongo-signature'] += ',t=1'; },
  noRaw: input => { delete input.rawBody; }, wrongMode: input => { input.headers['paymongo-signature'] = input.headers['paymongo-signature'].replace(',li=', '').replace(',te=', ',te=,li='); },
})) test(`signature: ${name} rejected without database access`, async () => {
  const env = setup(); const input = signed(); mutate(input);
  assert.equal((await invoke(env.webhook, input)).statusCode, 403); assert.equal(env.dbCalls(), 0);
});
for (const timestamp of [1, Math.floor(now.getTime() / 1000) + 301, 'NaN', '-123', '1e9']) test(`signature: timestamp ${timestamp} rejected`, async () => {
  const env = setup(); assert.equal((await invoke(env.webhook, signed(fixture(), timestamp))).statusCode, 403);
  assert.equal(env.dbCalls(), 0);
});
for (const [name, mutate] of Object.entries({
  failed: e => { attrs(e).payments[0].attributes.status = 'failed'; },
  pending: e => { attrs(e).payments[0].attributes.status = 'pending'; },
  cancelled: e => { attrs(e).status = 'cancelled'; },
  unknownState: e => { attrs(e).status = 'paid'; }, noPayment: e => { attrs(e).payments = []; },
  multiplePaid: e => { attrs(e).payments.push(structuredClone(attrs(e).payments[0])); },
  wrongAmount: e => { attrs(e).payments[0].attributes.amount = 1; },
  wrongCurrency: e => { attrs(e).payments[0].attributes.currency = 'USD'; },
  wrongIntentAmount: e => { attrs(e).payment_intent.attributes.amount = 1; },
  wrongIntentState: e => { attrs(e).payment_intent.attributes.status = 'processing'; },
  wrongIntentId: e => { attrs(e).payments[0].attributes.payment_intent_id = 'pi_other'; },
  wrongEventMode: e => { e.data.attributes.livemode = true; },
  wrongSessionMode: e => { attrs(e).livemode = true; },
  wrongPaymentMode: e => { attrs(e).payments[0].attributes.livemode = true; },
  missingPaymentMode: e => { delete attrs(e).payments[0].attributes.livemode; },
  wrongIntentMode: e => { attrs(e).payment_intent.attributes.livemode = true; },
  wrongLineItems: e => { attrs(e).line_items[0].quantity = 2; },
  unknownSession: e => { e.data.attributes.data.id = 'cs_unknown'; },
  invalidPaymentId: e => { attrs(e).payments[0].id = 'pay_bad/path'; },
  missingEventId: e => { delete e.data.id; },
  refunded: e => { attrs(e).payments[0].attributes.refunds = [{ id: 'ref_synthetic' }]; },
  disputed: e => { attrs(e).payments[0].attributes.disputed = true; },
  wrongMethod: e => { attrs(e).payments[0].attributes.source.type = 'card'; },
})) test(`payment: ${name} cannot grant`, async () => {
  const env = await ready(); const before = env.db.dump(); const event = fixture(); mutate(event);
  assert.ok((await invoke(env.webhook, signed(event))).statusCode >= 400); unchanged(env, before);
});
for (const override of [{ sessionId: 'cs_other' }, { paymentIntentId: 'pi_other' }, { state: 'cancelled' }, { state: 'expired' },
  { plan: 'Enterprise' }, { amount: 1 }, { currency: 'USD' }, { userId: 'stranger' }, { durationDays: 365 }]) {
  test(`order: invalid binding/policy ${JSON.stringify(override)}`, async () => {
    const env = await ready(); env.db.seed(orderPath, { ...env.db.read(orderPath), ...override }); const before = env.db.dump();
    assert.ok((await invoke(env.webhook, signed())).statusCode >= 400); unchanged(env, before);
  });
}
test('idempotency: sequential, concurrent and different-event retries yield one effect', async () => {
  const env = await ready();
  const responses = await Promise.all(Array.from({ length: 20 }, (_, i) => {
    const event = fixture(); if (i % 2) event.data.id = `evt_retry${i}`;
    return invoke(env.webhook, signed(event));
  }));
  assert.ok(responses.every(response => response.statusCode === 200));
  assert.equal(env.db.userWrites, 1); assert.ok(env.db.retries > 0);
  const account = env.db.read('users/owner');
  const later = createPaymentWebhook({ getDb: () => env.db, getConfig: () => config, clock: () => new Date(now.getTime() + 86400000) });
  assert.equal((await invoke(later, signed(fixture(), Math.floor(now.getTime() / 1000) + 86400))).statusCode, 200);
  assert.deepEqual(env.db.read('users/owner'), account); assert.equal(env.db.userWrites, 1);
});
test('idempotency: second payment on consumed checkout cannot extend term', async () => {
  const env = await ready(); await invoke(env.webhook, signed()); const before = env.db.dump();
  const event = fixture(); event.data.id = 'evt_other'; attrs(event).payments[0].id = 'pay_other';
  assert.equal((await invoke(env.webhook, signed(event))).statusCode, 409); assert.deepEqual(env.db.dump(), before);
});
for (const collection of ['payment_events', 'transactions', 'payment_orders', 'payment_sessions', 'users']) test(`transaction: ${collection} read failure cannot grant`, async () => {
  const env = await ready(); env.db.failRead = collection; const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 503); unchanged(env, before);
});
for (const collection of ['payment_events', 'transactions', 'payment_orders', 'users']) test(`transaction: ${collection} write failure is atomic`, async () => {
  const env = await ready(); env.db.failWrite = collection; const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 503); unchanged(env, before);
});
test('transaction: total commit failure then retry grants once', async () => {
  const env = await ready(); env.db.failCommit = true; const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 503); unchanged(env, before);
  env.db.failCommit = false; assert.equal((await invoke(env.webhook, signed())).statusCode, 200);
  assert.equal(env.db.userWrites, 1);
});
test('uniqueness: payment/event records for different orders cannot be reused', async () => {
  for (const path of [paymentPath, 'payment_events/test_evt_abc123']) {
    const env = await ready(); env.db.seed(path, { orderId: 'other', status: 'paid' }); const before = env.db.dump();
    assert.equal((await invoke(env.webhook, signed())).statusCode, 409); unchanged(env, before);
  }
});
test('missing account cannot be recreated by a valid payment', async () => {
  const env = await ready(); env.db.remove('users/owner'); const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 403); unchanged(env, before);
});
test('historical: metadata and legacy success record cannot synthesize a new order/grant', async () => {
  const env = setup(); env.db.seed('transactions/legacy', { userId: 'owner', status: 'paid', webhookEventId: 'evt_abc123' });
  const before = env.db.dump(); assert.equal((await invoke(env.webhook, signed())).statusCode, 409); unchanged(env, before);
});
test('historical: generic payment.paid cannot be acknowledged as fulfilled', async () => {
  const env = setup(); const event = fixture(); event.data.attributes.type = 'payment.paid';
  event.data.attributes.data = attrs(fixture()).payments[0];
  assert.equal((await invoke(env.webhook, signed(event))).statusCode, 409); assert.equal(env.dbCalls(), 0);
});

test('configuration: opaque signing secret has no invented prefix or minimum length', () => {
  assert.equal(paymentConfiguration({ ...config, nodeEnv: 'test', webhookSecret: 'opaque' }).mode, 'test');
  for (const webhookSecret of ['', '   ', 'whsec_REPLACE_WITH_YOUR_WEBHOOK_SECRET']) {
    assert.throws(() => paymentConfiguration({ ...config, nodeEnv: 'test', webhookSecret }));
  }
});
test('configuration: live checkout rejects missing/unsafe redirect configuration', () => {
  for (const dashboardUrl of ['', 'javascript:alert(1)', 'http://customer.example', 'https://localhost', 'https://user:pass@customer.example']) {
    assert.throws(() => paymentConfiguration({ ...config, mode: 'live', secretKey: 'sk_live_synthetic', nodeEnv: 'production', dashboardUrl }));
  }
});
test('signature: valid live fixture requires live header and all matching resource modes', async () => {
  const env = await ready(); const event = fixture(); event.data.attributes.livemode = true;
  for (const object of [attrs(event), attrs(event).payment_intent.attributes, attrs(event).payments[0].attributes]) object.livemode = true;
  env.db.seed(orderPath, { ...env.db.read(orderPath), mode: 'live' });
  env.db.seed('payment_sessions/live_cs_abc123', { ...env.db.read('payment_sessions/test_cs_abc123'), mode: 'live' });
  env.db.seed('payment_checkout_locks/owner', { orderId, sessionId: 'cs_abc123', mode: 'live' });
  const handler = createPaymentWebhook({ getDb: () => env.db, getConfig: () => ({ ...config, mode: 'live' }), clock: () => now });
  const input = signed(event); input.headers['paymongo-signature'] = input.headers['paymongo-signature'].replace(',li=', '').replace(',te=', ',te=,li=');
  assert.equal((await invoke(handler, input)).statusCode, 200); assert.equal(env.db.userWrites, 1);
});
test('signature: nonhex suffix and signed invalid JSON fail before database', async () => {
  const env = setup(); const input = signed(); input.headers['paymongo-signature'] = input.headers['paymongo-signature'].replace(',li=', 'zz,li=');
  assert.equal((await invoke(env.webhook, input)).statusCode, 403);
  const timestamp = Math.floor(now.getTime() / 1000);
  const rawBody = '{invalid';
  const digest = createHmac('sha256', config.webhookSecret).update(`${timestamp}.${rawBody}`).digest('hex');
  assert.equal((await invoke(env.webhook, { rawBody, headers: { 'paymongo-signature': `t=${timestamp},te=${digest}` } })).statusCode, 400);
  assert.equal(env.dbCalls(), 0);
});
test('checkout: binding and anomaly-store outage keeps durable creating hold', async () => {
  const env = setup({ handlers: { createSession: async () => { env.db.failCommit = true; return env.session; } } });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.db.read(orderPath).state, 'creating');
  assert.ok(env.reports.some(issue => issue.code === 'ORPHAN_RECORD_UNAVAILABLE'));
  env.db.failCommit = false;
  assert.equal((await invoke(env.checkout)).statusCode, 409); assert.equal(env.db.userWrites, 0);
});
test('payment: metadata and merchant reference are neither required nor ownership authority', async () => {
  const env = await ready(); const event = fixture(); delete attrs(event).metadata; attrs(event).reference_number = 'untrusted-other-order';
  assert.equal((await invoke(env.webhook, signed(event))).statusCode, 200);
  assert.equal(env.db.read('users/owner').plan, 'Pro'); assert.equal(env.db.read('users/stranger').plan, 'Free');
});

// Provider model caches results by API-key scope + idempotency key, rejects
// changed bytes, and can lose a response AFTER creating the provider object.
function recoveryHarness() {
  const db = memoryFirestore({ 'users/owner': customer });
  const cache = new Map(); const requests = []; let creations = 0;
  let instant = now.getTime(); let settings = { ...config }; let loseResponse = true; let failBefore = false;
  const request = async (url, options) => {
    const order = Object.values(db.dump()).find(value => value.idempotencyKey === options.headers['Idempotency-Key']);
    assert.ok(order, 'key persisted before provider call'); assert.equal(order.providerRequestBody, options.body);
    requests.push({ key: options.headers['Idempotency-Key'], body: options.body });
    if (failBefore) { failBefore = false; throw new Error('network failed before delivery'); }
    const key = `${options.headers.Authorization}/${options.headers['Idempotency-Key']}`;
    if (!cache.has(key)) {
      creations++;
      cache.set(key, { body: options.body, data: { id: `cs_recover${creations}`, type: 'checkout_session', attributes: {
        status: 'active', livemode: false, payment_method_types: ['qrph'], payment_intent: { id: `pi_recover${creations}` },
        checkout_url: `https://checkout.paymongo.com/recover${creations}` } } });
    }
    assert.equal(cache.get(key).body, options.body, 'provider rejects changed replay parameters');
    if (loseResponse) { loseResponse = false; throw new Error('response lost after create'); }
    return { ok: true, json: async () => ({ data: cache.get(key).data }) };
  };
  const handlers = createPaymentHandlers({ getDb: () => db, verifyIdToken: async () => ({ uid: 'owner' }),
    getConfig: () => settings, clock: () => new Date(instant), createSession: args => createPaymongoCheckout({ ...args, request }) });
  return { db, ...handlers, requests, creations: () => creations, advance: ms => { instant += ms; },
    configure: change => { settings = { ...settings, ...change }; },
    setFailure: (before, after) => { failBefore = before; loseResponse = after; },
    order: () => Object.values(db.dump()).find(value => value.idempotencyKey) };
}
for (const window of ['before-delivery', 'response-lost']) test(`provider idempotency: ${window} recovers same persisted attempt`, async () => {
  const env = recoveryHarness(); if (window === 'before-delivery') env.setFailure(true, false);
  assert.equal((await invoke(env.checkout, { body: { idempotencyKey: 'browser-forged' } })).statusCode, 503);
  const original = env.order(); assert.equal(original.state, 'retryable'); assert.notEqual(original.idempotencyKey, 'browser-forged');
  env.configure({ dashboardUrl: 'https://changed.example' }); env.advance(5001);
  assert.equal((await invoke(env.checkout)).statusCode, 200);
  assert.equal(env.creations(), 1); assert.equal(env.requests[0].key, env.requests[1].key);
  assert.equal(env.requests[0].body, env.requests[1].body); assert.equal(env.order().userId, 'owner');
  assert.equal(env.db.userWrites, 0);
});
test('provider idempotency: binding outage recovers cached session, no unbound grant', async () => {
  const env = recoveryHarness(); env.setFailure(false, false); env.db.failWrite = 'payment_sessions';
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.order().state, 'retryable'); assert.equal(env.db.read('payment_sessions/test_cs_recover1'), undefined);
  assert.equal(env.db.userWrites, 0); env.db.failWrite = null; env.advance(5001);
  assert.equal((await invoke(env.checkout)).statusCode, 200); assert.equal(env.creations(), 1);
  assert.equal(env.order().sessionId, 'cs_recover1');
});
test('provider idempotency: concurrent recovery makes one replay; lost browser response reuses bound URL', async () => {
  const env = recoveryHarness(); await invoke(env.checkout); env.advance(5001);
  const results = await Promise.all(Array.from({ length: 20 }, () => invoke(env.checkout)));
  assert.ok(results.every(result => [200, 409].includes(result.statusCode)));
  assert.equal(env.creations(), 1); assert.equal(env.requests.length, 2);
  assert.equal((await invoke(env.checkout)).body.sessionId, 'cs_recover1'); assert.equal(env.requests.length, 2);
});
test('provider idempotency: lease survives total failure; retry after lease recovers', async () => {
  const env = recoveryHarness(); env.db.failWrite = 'payment_orders';
  assert.equal((await invoke(env.checkout)).statusCode, 503); assert.equal(env.requests.length, 0);
  env.db.failWrite = null; await invoke(env.checkout);
  const original = env.order(); env.db.seed(`payment_orders/${original.id}`, { ...original, state: 'creating', retryAfter: new Date(now.getTime() + 60000).toISOString() });
  assert.equal((await invoke(env.checkout)).statusCode, 409);
  env.advance(60001); assert.equal((await invoke(env.checkout)).statusCode, 200); assert.equal(env.creations(), 1);
});
for (const condition of ['expired', 'rotated-key', 'mode-changed', 'missing-key', 'clock-backwards']) test(`provider idempotency: ${condition} cannot replay/create duplicate`, async () => {
  const env = recoveryHarness(); await invoke(env.checkout); env.advance(5001);
  if (condition === 'expired') env.advance(24 * 60 * 60 * 1000);
  if (condition === 'rotated-key') env.configure({ secretKey: 'sk_test_rotated' });
  if (condition === 'mode-changed') env.configure({ mode: 'live', secretKey: 'sk_live_synthetic' });
  if (condition === 'clock-backwards') env.advance(-60000);
  if (condition === 'missing-key') { const order = env.order(); env.db.seed(`payment_orders/${order.id}`, { ...order, idempotencyKey: null }); }
  assert.equal((await invoke(env.checkout)).statusCode, 409); assert.equal(env.requests.length, 1); assert.equal(env.db.userWrites, 0);
});
test('provider idempotency: different logical orders use different server-generated keys', async () => {
  const first = recoveryHarness(); const second = recoveryHarness();
  await invoke(first.checkout); await invoke(second.checkout);
  assert.notEqual(first.order().id, second.order().id); assert.notEqual(first.order().idempotencyKey, second.order().idempotencyKey);
});
test('subscription status: forged UID cannot downgrade another expired account', async () => {
  const env = setup(); env.db.seed('users/stranger', { ...customer, uid: 'stranger', plan: 'Pro', subscriptionExpiresAt: '2020-01-01' });
  const before = env.db.dump(); assert.equal((await invoke(env.status, { query: { userId: 'stranger' } })).statusCode, 403);
  unchanged(env, before);
});
test('webhook response compatibility: processed/reason fields remain for success, duplicate and ignored events', async () => {
  const env = await ready(); assert.equal((await invoke(env.webhook, signed())).body.processed, true);
  assert.equal((await invoke(env.webhook, signed())).body.reason, 'duplicate');
  for (const type of ['payment.failed', 'checkout_session.payment.failed', 'other.event']) {
    const event = fixture(); event.data.attributes.type = type;
    const result = await invoke(env.webhook, signed(event)); assert.equal(result.body.processed, false);
    if (type.endsWith('failed')) assert.equal(result.body.reason, 'failed');
  }
});
test('checkout recovery: delayed former lease cannot overwrite a newly bound session', async () => {
  let instant = now.getTime(); let releaseFirst; let started;
  const reachedProvider = new Promise(resolve => { started = resolve; });
  let calls = 0;
  const env = setup({ handlers: { clock: () => new Date(instant), createSession: async () => {
    calls++;
    if (calls === 1) { started(); return new Promise(resolve => { releaseFirst = resolve; }); }
    return env.session;
  } } });
  const first = invoke(env.checkout); await reachedProvider;
  instant += 60001;
  assert.equal((await invoke(env.checkout)).statusCode, 200);
  releaseFirst(env.session); assert.equal((await first).statusCode, 503);
  assert.equal(env.db.read(orderPath).state, 'pending');
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').orderId, orderId);
});
test('checkout recovery: exact conservative retention boundary refuses another provider POST', async () => {
  const env = recoveryHarness(); await invoke(env.checkout); env.advance(23 * 60 * 60 * 1000);
  assert.equal((await invoke(env.checkout)).statusCode, 409); assert.equal(env.requests.length, 1);
});

// Expiration/replacement fixture stays inside the isolated, network-free manifest.
async function replacementFixture(options = {}) {
  let instant = now.getTime(), initial = true, newCreates = 0, expirePosts = 0, reads = 0;
  let providerState = options.alreadyExpired ? 'expired' : 'active';
  const trace = [], delays = [];
  let env;
  const request = async (url, input) => {
    const old = env.db.read(orderPath);
    trace.push(input.method);
    assert.ok(url.startsWith('https://api.paymongo.com/v1/checkout_sessions/cs_abc123'));
    if (input.method === 'POST') {
      assert.equal(url, 'https://api.paymongo.com/v1/checkout_sessions/cs_abc123/expire');
      expirePosts++;
      if (options.expirationFailure) return { ok: false };
      if (!options.stillActive && !options.confirmAfterReads) providerState = 'expired';
      if (options.duringExpiration) await options.duringExpiration(env);
      return { ok: true };
    }
    reads++;
    if (options.confirmAfterReads && expirePosts && reads >= options.confirmAfterReads) providerState = 'expired';
    if (options.readFailure) throw Error('simulated provider outage');
    if (options.readHttp) return { ok: false, status: options.readHttp };
    if (options.malformedResponse) return { ok: true, json: async () => ({ data: null }) };
    const attributes = {
      status: providerState, livemode: false, payment_method_types: ['gcash'],
      line_items: [{ amount: old.amount, currency: old.currency, quantity: 1 }], payments: [],
      payment_intent: { id: 'pi_abc123', type: 'payment_intent', attributes: {
        amount: old.amount, currency: old.currency, livemode: false, status: 'awaiting_payment_method' } }
    };
    if (options.paid || options.paidAfterExpire && expirePosts) attributes.payment_intent.attributes.status = 'succeeded';
    if (options.ambiguous) attributes.payment_intent.attributes.status = 'processing';
    if (options.intentStatus) attributes.payment_intent.attributes.status = options.intentStatus;
    if (options.wrongMode) attributes.livemode = true;
    if (options.missingPayments) delete attributes.payments;
    if (options.wrongAmount) attributes.payment_intent.attributes.amount = 1;
    if (options.wrongCurrency) attributes.payment_intent.attributes.currency = 'USD';
    if (options.paidPayment) attributes.payments = [{ type: 'payment', id: 'pay_paid', attributes: { status: 'paid' } }];
    return { ok: true, json: async () => ({ data: { id: options.wrongSession ? 'cs_other' : 'cs_abc123', type: 'checkout_session', attributes } }) };
  };
  env = setup({ handlers: {
    clock: () => new Date(instant), newOrderId: () => initial ? orderId : randomUUID(),
    createSession: async ({ order }) => {
      if (initial) return { sessionId: 'cs_abc123', paymentIntentId: 'pi_abc123', checkoutUrl: 'https://checkout.paymongo.com/abc123' };
      newCreates++;
      assert.equal(providerState, 'expired');
      assert.equal(env.db.read(orderPath).state, 'superseded');
      assert.equal(env.db.read('payment_checkout_locks/owner').orderId, order.id);
      assert.deepEqual(JSON.parse(order.providerRequestBody).data.attributes.payment_method_types, ['qrph']);
      if (options.failCreateOnce && newCreates === 1) throw Error('simulated lost provider response');
      return { sessionId: 'cs_fresh123', paymentIntentId: 'pi_fresh123', checkoutUrl: 'https://checkout.paymongo.com/fresh123' };
    },
    expireSession: args => expirePaymongoCheckout({ ...args, request, sleep: async ms => { delays.push(ms); } })
  } });
  const plan = options.plan || 'pro';
  assert.equal((await invoke(env.checkout, { body: { plan } })).statusCode, 200);
  initial = false;
  const old = env.db.read(orderPath);
  const payload = JSON.parse(old.providerRequestBody);
  payload.data.attributes.payment_method_types = options.methods || ['gcash'];
  env.db.seed(orderPath, { ...old, providerRequestBody: JSON.stringify(payload) });
  return { ...env, plan, advance: ms => { instant += ms; }, setProviderState: state => { providerState = state; },
    counts: () => ({ newCreates, expirePosts, reads }), trace, delays };
}

test('replacement: matching current QR Ph intent reuses unchanged session without expiration or creation', async () => {
  const env = await replacementFixture({ methods: ['qrph'] }), before = env.db.dump();
  const response = await invoke(env.checkout);
  assert.equal(response.statusCode, 200); assert.equal(response.body.sessionId, 'cs_abc123');
  assert.deepEqual(env.counts(), { newCreates: 0, expirePosts: 0, reads: 0 });
  assert.deepEqual(env.db.dump(), before);
});

for (const plan of ['pro', 'pro_max']) test(`replacement: ${plan} expires GCash, preserves history, binds one fresh canonical QR Ph intent`, async () => {
  const env = await replacementFixture({ plan }), original = env.db.read(orderPath);
  const result = await invoke(env.checkout, { body: { plan } });
  assert.equal(result.statusCode, 200); assert.equal(result.body.sessionId, 'cs_fresh123');
  assert.notEqual(result.body.orderId, orderId); assert.equal(result.body.currency, 'PHP');
  assert.equal(result.body.amount, plan === 'pro' ? 149900 : 499900);
  assert.deepEqual(env.trace, ['GET', 'POST', 'GET']);
  const old = env.db.read(orderPath), current = env.db.read(`payment_orders/${result.body.orderId}`);
  assert.equal(old.state, 'superseded'); assert.equal(old.providerStatus, 'expired');
  assert.equal(old.sessionId, original.sessionId); assert.equal(old.providerRequestBody, original.providerRequestBody);
  assert.equal(old.supersededBy, current.id); assert.equal(current.durationDays, 30);
  assert.equal(current.apiRequestLimit, plan === 'pro' ? 5000 : null);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').state, 'superseded');
  assert.deepEqual(env.db.read('payment_checkout_locks/owner'), { orderId: current.id, sessionId: 'cs_fresh123', mode: 'test' });
  const second = await invoke(env.checkout, { body: { plan } });
  assert.equal(second.body.sessionId, 'cs_fresh123'); assert.equal(second.body.orderId, current.id);
  assert.deepEqual(env.counts(), { newCreates: 1, expirePosts: 1, reads: 2 }); assert.equal(env.db.userWrites, 0);
});

for (const fault of ['expirationFailure', 'readFailure', 'stillActive', 'paid', 'paidAfterExpire', 'ambiguous', 'wrongMode', 'missingPayments', 'wrongAmount', 'wrongCurrency', 'wrongSession']) {
  test(`replacement: ${fault} prevents a new payable checkout and entitlement`, async () => {
    const env = await replacementFixture({ [fault]: true });
    const response = await invoke(env.checkout);
    assert.equal(response.statusCode, 503); assert.equal(response.body.code, 'CHECKOUT_REVIEW');
    assert.equal(env.counts().newCreates, 0); assert.equal(env.db.read(orderPath).state, 'expiring');
    assert.equal(env.db.read('payment_checkout_locks/owner').orderId, orderId); assert.equal(env.db.userWrites, 0);
    if (['paid', 'ambiguous', 'wrongMode', 'missingPayments', 'wrongAmount', 'wrongCurrency', 'wrongSession'].includes(fault)) assert.equal(env.counts().expirePosts, 0);
  });
}

test('replacement: already expired/unpaid is verified without a second expiration POST', async () => {
  const env = await replacementFixture({ alreadyExpired: true });
  assert.equal((await invoke(env.checkout)).statusCode, 200);
  assert.deepEqual(env.counts(), { newCreates: 1, expirePosts: 0, reads: 1 });
});

test('replacement: concurrent Get Pro calls produce only one current replacement', async () => {
  const env = await replacementFixture();
  const results = await Promise.all(Array.from({ length: 20 }, () => invoke(env.checkout)));
  assert.ok(results.some(result => result.statusCode === 200));
  assert.ok(results.every(result => [200, 409].includes(result.statusCode)));
  assert.equal(env.counts().newCreates, 1); assert.equal(env.counts().expirePosts, 1);
  assert.equal(Object.values(env.db.dump()).filter(record => record.state === 'pending').length, 1);
});

test('replacement: expiration response loss retries from durable old intent without creating first', async () => {
  let failed = false;
  const env = await replacementFixture({ duringExpiration: async () => { if (!failed) { failed = true; throw Error('lost response'); } } });
  assert.equal((await invoke(env.checkout)).statusCode, 503); assert.equal(env.counts().newCreates, 0);
  const nextId = env.db.read(orderPath).replacementOrderId;
  env.advance(5001);
  const retry = await invoke(env.checkout);
  assert.equal(retry.statusCode, 200); assert.equal(retry.body.orderId, nextId);
  assert.equal(env.counts().expirePosts, 1); assert.equal(env.counts().newCreates, 1);
});

test('replacement: new provider failure retains exact new request/idempotency and never revives old session', async () => {
  const env = await replacementFixture({ failCreateOnce: true });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  const id = env.db.read('payment_checkout_locks/owner').orderId;
  const snapshot = env.db.read(`payment_orders/${id}`);
  assert.equal(snapshot.state, 'retryable'); env.advance(5001);
  assert.equal((await invoke(env.checkout)).body.sessionId, 'cs_fresh123');
  const current = env.db.read(`payment_orders/${id}`);
  assert.equal(current.idempotencyKey, snapshot.idempotencyKey); assert.equal(current.providerRequestBody, snapshot.providerRequestBody);
  assert.equal(env.counts().expirePosts, 1); assert.equal(env.db.read(orderPath).state, 'superseded');
});

for (const patch of [{ mode: 'live' }, { ...PRO_MAX_PURCHASE }, { amount: 1 }, { currency: 'USD' }, { durationDays: 31 }, { apiRequestLimit: 1 }]) {
  test(`replacement: incompatible mode/plan/canonical terms fail closed ${JSON.stringify(patch)}`, async () => {
    const env = await replacementFixture(); env.db.seed(orderPath, { ...env.db.read(orderPath), ...patch });
    const before = env.db.dump(); assert.equal((await invoke(env.checkout)).statusCode, 409);
    assert.deepEqual(env.db.dump(), before); assert.equal(env.counts().expirePosts, 0); assert.equal(env.counts().newCreates, 0);
  });
}

test('fence: superseded signed GCash settlement is retained/acknowledged without extending current paid entitlement', async () => {
  const env = await replacementFixture(); assert.equal((await invoke(env.checkout)).statusCode, 200);
  const event = fixture(); attrs(event).payments[0].attributes.source.type = 'gcash';
  env.db.seed('users/owner', { ...customer, plan: 'Pro Max', apiRequestLimit: null, subscription_status: 'active',
    subscriptionExpiresAt: '2026-12-01T00:00:00.000Z' });
  const account = env.db.read('users/owner');
  const result = await invoke(env.webhook, signed(event));
  assert.equal(result.statusCode, 200); assert.equal(result.body.reviewRequired, true); assert.equal(result.body.processed, false);
  assert.equal(env.db.read(paymentPath).status, 'paid'); assert.equal(env.db.read(paymentPath).entitlementGranted, false);
  assert.equal(env.db.read(paymentPath).reviewReason, 'checkout_not_current');
  assert.deepEqual(env.db.read('users/owner'), account); assert.equal(env.db.userWrites, 0);
  const second = await invoke(env.webhook, signed(event));
  assert.equal(second.body.duplicate, true); assert.equal(second.body.reviewRequired, true);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').supersededBy, env.db.read('payment_checkout_locks/owner').orderId);
});

test('fence: current fresh QR Ph session still fulfills Pro atomically once', async () => {
  const env = await replacementFixture(); const response = await invoke(env.checkout);
  const event = fixture(); event.data.attributes.data.id = 'cs_fresh123';
  attrs(event).payment_intent.id = 'pi_fresh123'; attrs(event).payments[0].attributes.payment_intent_id = 'pi_fresh123';
  assert.equal((await invoke(env.webhook, signed(event))).body.processed, true);
  assert.equal(env.db.read('users/owner').plan, 'Pro'); assert.equal(env.db.read('users/owner').apiRequestLimit, 5000);
  assert.equal(env.db.read(`payment_orders/${response.body.orderId}`).state, 'processed');
  assert.equal((await invoke(env.webhook, signed(event))).body.duplicate, true); assert.equal(env.db.userWrites, 1);
});

test('fence: processed redelivery remains idempotent after another checkout becomes current', async () => {
  const env = await ready(); assert.equal((await invoke(env.webhook, signed())).body.processed, true);
  const account = env.db.read('users/owner');
  env.db.seed('payment_checkout_locks/owner', { orderId: randomUUID(), sessionId: 'cs_another' });
  assert.equal((await invoke(env.webhook, signed())).body.duplicate, true);
  assert.deepEqual(env.db.read('users/owner'), account); assert.equal(env.db.userWrites, 1);
});

for (const fault of ['lockChanged', 'lockMissing', 'lockWrongSession', 'lockWrongMode', 'bindingSuperseded', 'bindingExpired', 'orderExpired', 'providerExpired', 'reviewRequired']) {
  test(`fence: ${fault} preserves verified settlement evidence without granting`, async () => {
    const env = await ready(), event = fixture();
    if (fault === 'lockChanged') env.db.seed('payment_checkout_locks/owner', { orderId: randomUUID() });
    if (fault === 'lockMissing') env.db.remove('payment_checkout_locks/owner');
    if (fault === 'lockWrongSession') env.db.seed('payment_checkout_locks/owner', { orderId, sessionId: 'cs_other' });
    if (fault === 'lockWrongMode') env.db.seed('payment_checkout_locks/owner', { orderId, sessionId: 'cs_abc123', mode: 'live' });
    if (fault === 'bindingSuperseded') env.db.seed('payment_sessions/test_cs_abc123', { ...env.db.read('payment_sessions/test_cs_abc123'), state: 'superseded' });
    if (fault === 'bindingExpired') env.db.seed('payment_sessions/test_cs_abc123', { ...env.db.read('payment_sessions/test_cs_abc123'), providerStatus: 'expired' });
    if (fault === 'orderExpired') env.db.seed(orderPath, { ...env.db.read(orderPath), providerStatus: 'expired' });
    if (fault === 'providerExpired') attrs(event).status = 'expired';
    if (fault === 'reviewRequired') env.db.seed(orderPath, { ...env.db.read(orderPath), state: 'review_required' });
    const account = env.db.read('users/owner'); const result = await invoke(env.webhook, signed(event));
    assert.equal(result.statusCode, 200); assert.equal(result.body.reviewRequired, true);
    assert.equal(env.db.read(paymentPath).entitlementGranted, false);
    assert.deepEqual(env.db.read('users/owner'), account); assert.equal(env.db.userWrites, 0);
    assert.equal((await invoke(env.webhook, signed(event))).body.duplicate, true);
  });
}

test('fence: settlement racing provider expiration prevents any fresh checkout and retains reconciliation evidence', async () => {
  const env = await replacementFixture({ duringExpiration: async active => {
    const event = fixture(); attrs(event).payments[0].attributes.source.type = 'gcash';
    assert.equal((await invoke(active.webhook, signed(event))).body.reviewRequired, true);
  } });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.counts().newCreates, 0); assert.equal(env.db.read(orderPath).state, 'review_required');
  assert.equal(env.db.read(paymentPath).entitlementGranted, false); assert.equal(env.db.userWrites, 0);
});

test('fence: unreadable checkout lock cannot grant or partially record a settlement', async () => {
  const env = await ready(); env.db.failRead = 'payment_checkout_locks/'; const before = env.db.dump();
  assert.equal((await invoke(env.webhook, signed())).statusCode, 503); assert.deepEqual(env.db.dump(), before);
});

test('provider creation: a response storing GCash cannot pass a QR Ph request contract', async () => {
  await assert.rejects(createPaymongoCheckout({ config, order: providerOrder(), request: async () => ({ ok: true,
    json: async () => ({ data: { id: 'cs_abc123', type: 'checkout_session', attributes: { livemode: false,
      status: 'active', payment_method_types: ['gcash'], payment_intent: { id: 'pi_abc123' }, checkout_url: 'https://checkout.paymongo.com/abc123' } } }) }) }),
  error => error.code === 'PROVIDER_UNCERTAIN');
});

test('replacement: commit failure after provider expiry preserves retirement and safely resumes', async () => {
  const env = await replacementFixture({ duringExpiration: async active => { active.db.failCommit = true; } });
  assert.equal((await invoke(env.checkout)).statusCode, 503);
  assert.equal(env.counts().newCreates, 0);
  const replacementId = env.db.read(orderPath).replacementOrderId;
  assert.equal(env.db.read(orderPath).state, 'expiring');
  assert.equal(env.db.read('payment_checkout_locks/owner').orderId, orderId);
  env.db.failCommit = false; env.advance(60001);
  const retry = await invoke(env.checkout);
  assert.equal(retry.statusCode, 200); assert.equal(retry.body.orderId, replacementId);
  assert.deepEqual(env.counts(), { newCreates: 1, expirePosts: 1, reads: 3 });
});

test('replacement: delayed former expiration lease cannot create a competing new order', async () => {
  let release, started;
  const entered = new Promise(resolve => { started = resolve; });
  const env = await replacementFixture({ duringExpiration: async () => {
    started(); await new Promise(resolve => { release = resolve; });
  } });
  const first = invoke(env.checkout); await entered;
  env.advance(60001);
  const second = await invoke(env.checkout);
  assert.equal(second.statusCode, 200);
  release(); assert.equal((await first).statusCode, 503);
  assert.equal(env.counts().newCreates, 1);
  assert.equal(env.db.read('payment_checkout_locks/owner').orderId, second.body.orderId);
  assert.equal(env.db.read(`payment_orders/${second.body.orderId}`).state, 'pending');
});

function markExpiring(env) {
  const replacementOrderId = randomUUID();
  env.db.seed(orderPath, { ...env.db.read(orderPath), state: 'expiring', replacementOrderId,
    attemptId: 'former-expiration-lease', retryAfter: new Date(now.getTime() - 1).toISOString() });
  return replacementOrderId;
}

test('recovery: pre-existing expiring order plus expired/unpaid provider resumes the saved replacement intent', async () => {
  const env = await replacementFixture({ alreadyExpired: true });
  const id = markExpiring(env), original = env.db.read(orderPath);
  const result = await invoke(env.checkout);
  assert.equal(result.statusCode, 200); assert.equal(result.body.orderId, id);
  assert.equal(result.body.sessionId, 'cs_fresh123');
  assert.deepEqual(env.counts(), { newCreates: 1, expirePosts: 0, reads: 1 });
  assert.equal(env.db.read(orderPath).state, 'superseded');
  assert.equal(env.db.read(orderPath).providerRequestBody, original.providerRequestBody);
  assert.equal(env.db.read('payment_sessions/test_cs_abc123').state, 'superseded');
  assert.equal(env.db.read('payment_checkout_locks/owner').sessionId, 'cs_fresh123');
});

test('recovery: delayed explicit expired visibility is confirmed by only three reads after one expire POST', async () => {
  const env = await replacementFixture({ confirmAfterReads: 4 }); markExpiring(env);
  assert.equal((await invoke(env.checkout)).statusCode, 200);
  assert.deepEqual(env.trace, ['GET', 'POST', 'GET', 'GET', 'GET']);
  assert.deepEqual(env.delays, [250, 500]);
  assert.deepEqual(env.counts(), { newCreates: 1, expirePosts: 1, reads: 4 });
});

test('recovery: active provider stays bounded, later concurrent retries observe expired and create only once', async () => {
  const env = await replacementFixture({ stillActive: true }); const id = markExpiring(env);
  const first = await invoke(env.checkout);
  assert.equal(first.statusCode, 503); assert.equal(first.body.code, 'CHECKOUT_REVIEW');
  assert.deepEqual(env.counts(), { newCreates: 0, expirePosts: 1, reads: 4 });
  assert.deepEqual(env.delays, [250, 500]); assert.equal(env.db.read(orderPath).state, 'expiring');
  assert.equal(env.reports.at(-1).reason, 'CHECKOUT_STILL_ACTIVE');
  env.setProviderState('expired'); env.advance(5001);
  const results = await Promise.all(Array.from({ length: 20 }, () => invoke(env.checkout)));
  assert.ok(results.some(result => result.statusCode === 200 && result.body.orderId === id));
  assert.ok(results.every(result => [200,409].includes(result.statusCode)));
  assert.equal(env.counts().newCreates, 1); assert.equal(env.counts().expirePosts, 1);
  assert.equal(env.db.read('payment_checkout_locks/owner').orderId, id);
  assert.equal(env.db.read(orderPath).state, 'superseded'); assert.equal(env.db.userWrites, 0);
});

for (const fault of [{ readHttp: 404 }, { readHttp: 503 }, { readFailure: true }, { malformedResponse: true },
  { alreadyExpired: true, paid: true }, { alreadyExpired: true, paidPayment: true }, { alreadyExpired: true, ambiguous: true },
  { intentStatus: 'cancelled' }, { alreadyExpired: true, intentStatus: 'unknown' },
  { alreadyExpired: true, intentStatus: 'cancelled', paidPayment: true }]) {
  test(`recovery: unreliable or settled expiring session fails closed ${JSON.stringify(fault)}`, async () => {
    const env = await replacementFixture(fault); const id = markExpiring(env);
    const result = await invoke(env.checkout);
    assert.equal(result.statusCode, 503); assert.equal(result.body.code, 'CHECKOUT_REVIEW');
    assert.equal(env.db.read(orderPath).state, 'expiring'); assert.equal(env.db.read(orderPath).replacementOrderId, id);
    assert.equal(env.db.read('payment_checkout_locks/owner').orderId, orderId);
    assert.deepEqual(env.counts(), { newCreates: 0, expirePosts: 0, reads: 1 }); assert.equal(env.db.userWrites, 0);
  });
}

test('recovery: expired session with exact bound cancelled intent and empty payments certifies old GCash expiry', async () => {
  const env = await replacementFixture({ alreadyExpired: true, intentStatus: 'cancelled' }); const id = markExpiring(env);
  const result = await invoke(env.checkout);
  assert.equal(result.statusCode, 200); assert.equal(result.body.orderId, id);
  assert.deepEqual(env.counts(), { newCreates: 1, expirePosts: 0, reads: 1 });
  assert.equal(env.db.read(orderPath).state, 'superseded'); assert.equal(env.db.userWrites, 0);
});

test('recovery: cancelled intent after explicit expiration becomes visible within the bounded window', async () => {
  const env = await replacementFixture();
  // Separate explicit-expired recovery above is the observed provider contract;
  // this test checks the adapter directly for the active -> expired transition.
  const old = env.db.read(orderPath); let calls = 0;
  const readResource = state => ({ data: { id: old.sessionId, type: 'checkout_session', attributes: {
    status: state, livemode: false, payment_method_types: ['gcash'], payments: [],
    line_items: [{ amount: old.amount, currency: old.currency, quantity: 1 }],
    payment_intent: { id: old.paymentIntentId, type: 'payment_intent', attributes: {
      amount: old.amount, currency: old.currency, livemode: false,
      status: state === 'expired' ? 'cancelled' : 'awaiting_payment_method' } }
  } } });
  const result = await expirePaymongoCheckout({ order: old, config, request: async (_url,input) => {
    calls++; return { ok: true, json: async () => readResource(calls === 1 ? 'active' : 'expired') };
  } });
  assert.deepEqual(result, { sessionId: old.sessionId, status: 'expired', unpaid: true }); assert.equal(calls,3);
});
