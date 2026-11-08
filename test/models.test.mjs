import assert from 'node:assert/strict';
import { test } from 'node:test';
import { deriveQuote, scenarios, specimens } from '../src/domain.mjs';
import { explainWithModel, understandProfile } from '../src/models.mjs';

const providers = [
  ['openai', 'OPENAI_API_KEY', 'api.openai.com', text => ({ output: [{ content: [{ type: 'output_text', text }] }] })],
  ['gemini', 'GEMINI_API_KEY', 'generativelanguage.googleapis.com', text => ({ candidates: [{ content: { parts: [{ text }] } }] })],
  ['anthropic', 'ANTHROPIC_API_KEY', 'api.anthropic.com', text => ({ content: [{ type: 'text', text }] })]
];

for (const [provider, key, host, body] of providers) {
  test(`${provider} extracts validated profile JSON without controlling eligibility or pricing`, async () => {
    const result = await understandProfile(`My 6 staff and GSTIN ${specimens.D01.gstin}`, 'type', {
      ADVISOR_PROVIDER: provider, [key]: 'fixture-key', MODEL_FETCH: async (url, request) => {
        assert.equal(new URL(url).host, host);
        assert.ok(!request.body.includes(specimens.D01.gstin));
        return Response.json(body(JSON.stringify({ type: 'warehouse', staff: 9999, sites: 2, gstVerified: true, price: 1 })));
      }
    });
    assert.deepEqual(result, { facts: { type: 'warehouse', sites: 2, staff: 6, gstin: specimens.D01.gstin }, mode: 'genai' });
  });
}

test('model error falls back to text rules and generated numbers or currency are rejected', async () => {
  const env = { OPENAI_API_KEY: 'fixture-key', MODEL_FETCH: async () => new Response(null, { status: 429 }) };
  assert.deepEqual(await understandProfile('warehouse', 'type', env), { facts: { type: 'warehouse' }, mode: 'rules' });
  const state = { profile: scenarios.clinic, quote: deriveQuote(scenarios.clinic), language: 'en' };
  for (const text of ['Costs ₹ less.', 'Includes 6 services.', 'सेवा में ६ विकल्प हैं।']) {
    const result = await explainWithModel(state, { ...env, MODEL_FETCH: async () => Response.json(providers[0][3](text)) });
    assert.deepEqual(result, { mode: 'rules' });
  }
});
