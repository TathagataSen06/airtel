import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { createHmac } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import { route } from '../src/server.mjs';
import { checkRegistration, deriveQuote, evaluateEvidence, policyVersion, priority, scenarios, skuEligible, specimens } from '../src/domain.mjs';
import { baselines, officialGst, productSource } from '../src/data.mjs';
import { extractFields } from '../public/ocr.mjs';

function adapter() {
  const store = new DatabaseSync(':memory:');
  const migrations = new URL('../drizzle/', import.meta.url);
  for (const file of readdirSync(migrations).filter(name => name.endsWith('.sql')).sort()) {
    store.exec(readFileSync(new URL(file, migrations), 'utf8'));
  }
  return { prepare: sql => ({ bind: (...args) => ({
    first: async () => store.prepare(sql).get(...args),
    run: async () => ({ meta: store.prepare(sql).run(...args) })
  }) }) };
}
function client() {
  const DB = adapter();
  let token, id;
  async function call(path, body, auth = token) {
    const response = await route(new Request('https://demo.invalid/api' + path, {
      headers: auth ? { Authorization: 'Bearer ' + auth } : {},
      ...(body ? { method: 'POST', body: JSON.stringify(body) } : {})
    }), { DB });
    return { status: response.status, ...(await response.json()) };
  }
  async function create(body) {
    const result = await call('/cases', body);
    ({ token } = result);
    id = result.state.id;
    return result.state;
  }
  return { call, create, move: (action, fields = {}) => call('/cases/' + id, { action, ...fields }) };
}
const evidence = (fields) => Object.fromEntries(Object.entries(fields).map(([key, value]) =>
  [key, value && { synthetic: true, confidence: 98, fields: value }]
));

test('catalogue floors and hard dependencies come from the supplied case', () => {
  assert.equal(Object.keys(productSource).length, 25);
  const clinic = deriveQuote(scenarios.clinic);
  assert.deepEqual([clinic.monthly, clinic.setup], [2670, 1500]);
  const lower = deriveQuote(scenarios.clinic, { backup: false });
  assert.deepEqual([lower.monthly, lower.setup], [2171, 0]);
  const shop = deriveQuote(scenarios.retail, { pos: true });
  assert.deepEqual([shop.monthly, shop.setup], [1897, 2500]);
  assert.equal(deriveQuote(scenarios.shop).monthly, 1198);
  assert.equal(deriveQuote({ ...scenarios.clinic, pin: '302029' }, { backup: true }).toggles.some(item => item.id === 'P09'), false);
  assert.equal(skuEligible('P10', { staff: 15, sites: 3, chosen: ['P02'], gstVerified: false }), false);
  assert.equal(skuEligible('P10', { staff: 15, sites: 3, chosen: ['P02'], gstVerified: true }), true);
  assert.equal(deriveQuote(scenarios.multisite).lines[0].qty, 3);
  assert.equal(deriveQuote(scenarios.survey).route, 'survey');
  assert.equal(baselines.activation, 368);
});

test('OCR normalization handles structurally constrained digits, keeping identifiers masked in decisions', () => {
  const gst = extractFields('gst', 'UDYAM DEMO SPECIMEN\nGSTIN: O8DMYPS8131A1ZL');
  assert.equal(gst.fields.GSTIN, '08DMYPS8131A1ZL');
  const original = specimens.K01;
  const cancelled = evaluateEvidence('K01', evidence({ gst: { GSTIN: original.gstin } }));
  assert.equal(officialGst[original.gstin][4], 'Cancelled');
  assert.equal(cancelled.status, 'review');
  assert.ok(cancelled.checks.some(row => row.reason === 'GST_CANCELLED'));
  assert.ok(!JSON.stringify(cancelled).includes(original.gstin));
  const missing = evaluateEvidence('K05', evidence({}));
  assert.ok(missing.checks.some(row => row.name === 'udyam' && row.reason === 'PROOF_MISSING'));
});

test('resume code is single use and rotates the case bearer without altering the quote or partner', async () => {
  const demo = client();
  const s = await demo.create({ scenario: 'clinic' });
  assert.equal((await demo.move('toggle', { key: 'backup', enabled: false, revision: 0 })).status, 409);
  const repriced = await demo.move('toggle', { key: 'backup', enabled: false, revision: s.quoteRevision });
  assert.equal(repriced.state.quote.monthly, 2171);
  const issued = await demo.move('issueCode');
  const body = { id: s.id, code: issued.code };
  const resumed = await demo.call('/resume', body);
  assert.equal(resumed.state.id, s.id);
  assert.equal(resumed.state.channel, 'web');
  assert.equal(resumed.state.partner, 'JPR-07');
  assert.equal(resumed.state.quote.monthly, 2171);
  assert.equal((await demo.call('/resume', body)).status, 409);
  assert.equal((await demo.move('language', { language: 'hi' })).status, 401);
  assert.equal((await demo.call('/cases/' + s.id, undefined, resumed.token)).status, 200);
});

test('KYC gate blocks payment and keeps the cancelled record in review', async () => {
  const demo = client();
  const s = await demo.create({ scenario: 'cancelled' });
  await demo.move('acceptQuote', { revision: s.quoteRevision });
  const docs = evidence({ gst: { GSTIN: specimens.K01.gstin } });
  assert.equal((await demo.move('verify', { documents: docs })).error, 'CONSENT_REQUIRED');
  await demo.move('consent', { accepted: true, version: policyVersion });
  assert.equal((await demo.move('verify', { documents: docs })).state.kyc.status, 'review');
  assert.equal((await demo.move('pay', { key: 'retry-key-0000' })).error, 'KYC_GATE');
  assert.equal((await demo.move('verify', { documents: docs })).error, 'REVIEW_IN_PROGRESS');
  assert.equal((await demo.move('review')).state.fixture, 'K01R');
});

test('failed payment, concurrent retry and fulfilment leave one receipt and one referral credit', async () => {
  const demo = client();
  const s = await demo.create({ scenario: 'clinic' });
  await demo.move('acceptQuote', { revision: s.quoteRevision });
  await demo.move('consent', { accepted: true, version: policyVersion });
  assert.equal((await demo.move('verify', { documents: evidence(specimens.D01.fields) })).state.phase, 'checkout');
  const held = await demo.move('hold', { slot: 'JUL20-AM', revision: s.quoteRevision });
  const payload = { hold: held.state.hold.id, revision: s.quoteRevision, amount: 4170, key: 'retry-key-0000' };
  assert.equal((await demo.move('pay', { ...payload, amount: 1 })).error, 'QUOTE_CHANGED');
  assert.equal((await demo.move('pay', { ...payload, fail: true })).failed, true);
  const replies = await Promise.all([demo.move('pay', payload), demo.move('pay', payload), demo.move('pay', { ...payload, key: 'retry-key-0001' })]);
  assert.ok(replies.every(reply => reply.status === 200));
  assert.equal(new Set(replies.map(reply => reply.state.order.id)).size, 1);
  assert.equal(replies.filter(reply => !reply.replayed).length, 1);
  for (let step = 0; step < 3; step++) await demo.move('advance', { expectedStep: step });
  const final = await demo.move('pay', payload);
  assert.equal(final.state.order.step, 3);
  assert.equal(final.state.events.filter(row => row.event === 'PARTNER_CREDITED').length, 1);
});

test('consent withdrawal clears proof results and closes an unpaid case', async () => {
  const demo = client();
  const s = await demo.create({ scenario: 'shop' });
  await demo.move('acceptQuote', { revision: s.quoteRevision });
  await demo.move('consent', { accepted: true, version: policyVersion });
  await demo.move('verify', { documents: evidence(specimens.D02.fields) });
  const result = await demo.move('withdraw');
  assert.equal(result.state.phase, 'closed');
  assert.equal(result.state.consent, null);
  assert.equal(result.state.kyc, null);
});

test('Hindi intake, deterministic estimate, active GSTIN and verification against a different applicant', async () => {
  const demo = client();
  await demo.create({ channel: 'web', language: 'hi' });
  const { state: partial } = await demo.move('intake', { text: 'मेरी जयपुर में दो दुकानें हैं, 6 लोग, CCTV चाहिए' });
  assert.deepEqual(partial.profile, { type: 'retail', city: 'Jaipur', sites: 2, staff: 6, tools: ['cctv'] });
  assert.equal(partial.nextQuestion, 'budget');
  assert.equal(partial.draftQuote.lines.find(line => line.id === 'P23').qty, 2);
  const budget = await demo.move('intake', { text: 'WhatsApp API, ₹8000 per month' });
  assert.equal(budget.state.nextQuestion, 'gst');
  const { state: quoted } = await demo.move('answer', { key: 'gst', value: specimens.D01.gstin });
  assert.equal(quoted.profile.gstStatus, 'active');
  assert.ok(quoted.quote.lines.some(line => line.id === 'P15'));
  assert.ok(!JSON.stringify(quoted).includes(specimens.D01.gstin));
  assert.equal(quoted.registrationHash, undefined);
  assert.equal(checkRegistration(specimens.K01.gstin).gstStatus, 'cancelled');
  const suspended = Object.keys(officialGst).find(gstin => checkRegistration(gstin).gstStatus === 'suspended');
  if (suspended) assert.equal(checkRegistration(suspended).gstVerified, false);

  await demo.move('acceptQuote', { revision: quoted.quoteRevision });
  await demo.move('consent', { accepted: true, version: policyVersion });
  const gst = specimens.K01R.fields.gst;
  const other = evidence({ gst,
    id: { 'SIGNATORY ID': 'SYN-ID-123456', 'SIGNATORY NAME': specimens.K01R.signer, 'TRADE NAME': gst['TRADE NAME'] },
    address: { 'LEGAL NAME': gst['TRADE NAME'], ADDRESS: gst.ADDRESS, 'ISSUE DATE': '2026-07-01' }
  });
  assert.equal(evaluateEvidence({ gst: true }, other).status, 'cleared');
  const mismatch = await demo.move('verify', { documents: other });
  assert.equal(mismatch.state.kyc.status, 'correction');
  assert.ok(mismatch.state.kyc.checks.some(check => check.reason === 'GST_QUOTE_MISMATCH'));
  const clear = await demo.move('verify', { documents: evidence(specimens.D01.fields) });
  assert.equal(clear.state.phase, 'checkout');
});

test('server checks the actual evidence independently of the fixture name or OCR confidence', () => {
  const clean = evidence(specimens.D01.fields);
  assert.equal(evaluateEvidence('K01', clean).status, 'cleared');
  const otherState = structuredClone(clean);
  otherState.gst.fields.ADDRESS = '21 PILOT ROAD, MUMBAI, MAHARASHTRA - 400001';
  assert.ok(evaluateEvidence({ gst: true }, otherState).checks.some(check => check.reason === 'GST_STATE_MISMATCH' && check.tamper));
  const otherUnit = structuredClone(clean);
  otherUnit.address.fields.ADDRESS = otherUnit.address.fields.ADDRESS.replace('21', '31');
  assert.ok(evaluateEvidence({ gst: true }, otherUnit).checks.some(check => check.reason === 'ADDRESS_MISMATCH'));
  const forged = structuredClone(clean);
  forged.gst.confidence = 100;
  forged.gst.fields.GSTIN = forged.gst.fields.GSTIN.replace(/.$/, '0');
  assert.ok(evaluateEvidence({ gst: true }, forged).checks.some(check => check.reason === 'GSTIN_NEAR_MATCH' && check.tamper));
  forged.address.fields['ISSUE DATE'] = '2026-02-30';
  assert.ok(evaluateEvidence({ gst: true }, forged).checks.some(check => check.reason === 'ADDRESS_STALE'));
});

test('propensity is deterministic, bounded and available for finished quotes only', () => {
  assert.equal(priority({ profile: {}, quote: null }).score, null);
  const profile = { ...scenarios.clinic };
  const unregistered = priority({ profile, quote: deriveQuote(profile) });
  profile.gstVerified = true;
  const registered = priority({ profile, quote: deriveQuote(profile) });
  assert.ok(registered.score > unregistered.score && registered.score < 100 && unregistered.score > 0);
  assert.deepEqual(priority({ profile, quote: deriveQuote(profile) }), registered);
});

test('WhatsApp verifies challenges and signatures, retries transport failures and redeems one case link', async () => {
  const root = 'https://demo.invalid';
  const path = root + '/api/whatsapp/webhook';
  const replies = [];
  let retry = true;
  const env = {
    DB: adapter(), WHATSAPP_VERIFY_TOKEN: 'fixture-verify', WHATSAPP_APP_SECRET: 'fixture-app-secret',
    WHATSAPP_ACCESS_TOKEN: 'fixture-access', WHATSAPP_PHONE_NUMBER_ID: '123456',
    WHATSAPP_GRAPH_VERSION: 'v25.0', PUBLIC_APP_URL: root,
    WHATSAPP_FETCH: async (url, options) => {
      assert.equal(url, 'https://graph.facebook.com/v25.0/123456/messages');
      assert.equal(options.headers.Authorization, 'Bearer fixture-access');
      if (retry) { retry = false; return new Response(null, { status: 502 }); }
      const body = JSON.parse(options.body);
      assert.equal(body.to, '919999000001');
      replies.push(body.text.body);
      return Response.json({ messages: [{ id: 'fixture-reply' }] });
    }
  };
  const verify = await route(new Request(path + '?hub.mode=subscribe&hub.verify_token=fixture-verify&hub.challenge=12345'), env);
  assert.deepEqual([verify.status, await verify.text()], [200, '12345']);
  assert.equal((await route(new Request(path + '?hub.mode=subscribe&hub.verify_token=bad&hub.challenge=12345'), env)).status, 403);
  function signed(id, text, signature) {
    const body = JSON.stringify({ object: 'whatsapp_business_account', entry: [{ changes: [{ field: 'messages', value: {
      metadata: { phone_number_id: '123456' }, messages: [{ id, from: '919999000001', type: 'text', text: { body: text } }]
    } }] }] });
    const hmac = createHmac('sha256', env.WHATSAPP_APP_SECRET).update(body).digest('hex');
    return new Request(path, { method: 'POST', body, headers: { 'X-Hub-Signature-256': 'sha256=' + (signature || hmac) } });
  }
  const first = 'मेरी जयपुर में दो दुकानें हैं, 6 लोग, CCTV चाहिए';
  assert.equal((await route(signed('test-message-1', first, '0'.repeat(64)), env)).status, 403);
  assert.equal((await route(signed('test-message-1', first), env)).status, 503);
  assert.equal((await route(signed('test-message-1', first), env)).status, 200);
  assert.equal((await route(signed('test-message-1', first), env)).status, 200);
  assert.equal(replies.length, 1);
  assert.match(replies[0], /मासिक बजट/);
  assert.equal((await route(signed('test-message-2', '₹4000 per month, no GSTIN'), env)).status, 200);
  const link = new URL(replies[1].match(/https:\/\/[^\s]+/)[0]);
  const [id, code] = link.hash.slice('#resume='.length).split('.');
  const resume = () => route(new Request(root + '/api/resume', { method: 'POST', body: JSON.stringify({ id, code }) }), env);
  const { state } = await (await resume()).json();
  assert.equal(state.quote.monthly, 3695);
  assert.equal(state.profile.sites, 2);
  assert.equal(state.lastInbound, undefined);
  assert.equal((await resume()).status, 409);
});
