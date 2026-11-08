import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { route } from '../src/server.mjs';
import { deriveQuote, evaluateEvidence, policyVersion, scenarios, skuEligible, specimens } from '../src/domain.mjs';
import { baselines, officialGst, productSource } from '../src/data.mjs';
import { extractFields } from '../public/ocr.mjs';

function adapter() {
  const store = new DatabaseSync(':memory:');
  store.exec(readFileSync(new URL('../drizzle/0000_cases.sql', import.meta.url), 'utf8'));
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
  assert.equal(deriveQuote({ ...scenarios.clinic, pin: '302029' }, { backup: true }).canBackup, false);
  assert.equal(skuEligible('P10', { staff: 15, sites: 3, chosen: ['P02'], gstVerified: false }), false);
  assert.equal(skuEligible('P10', { staff: 15, sites: 3, chosen: ['P02'], gstVerified: true }), true);
  assert.equal(deriveQuote(scenarios.multisite).route, 'complex');
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
