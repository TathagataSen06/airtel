import assert from 'node:assert/strict';
import { test } from 'node:test';
import { catalogue, deriveQuote, scenarios, skuEligible } from '../src/domain.mjs';

const base = { type: 'office', sites: 1, staff: 3, pin: '110024', tools: [], budget: 3000 };
const active = { gstVerified: true, gstStatus: 'active' };
const examples = [
  ['Delhi retail and POS', { type: 'retail', staff: 2, tools: ['pos'] }, 'P01 P07 P19', 1897, 2500],
  ['Jaipur clinic with failover', scenarios.clinic, 'P02 P09 P16:3 P20:3', 2670, 1500],
  ['Mumbai gigabit with static IP', { ...active, pin: '400099', staff: 5, budget: 5500, tools: ['static-ip'] }, 'P03 P11', 4199, 0],
  ['Jaipur retail with Wi-Fi and CCTV', { ...active, type: 'retail', pin: '302021', staff: 6, tools: ['guest-wifi', 'cctv'] }, 'P02 P07 P22 P23', 2396, 2800, { P03: 'TIER' }],
  ['Factory with leased line, firewall and IoT', { ...active, pin: '440001', type: 'factory', staff: 10, machines: 3,
    budget: 12000, tools: ['outages', 'firewall', 'iot'] }, 'P05 P09 P21 P24:3', 10945, 24500],
  ['Large two-site factory', { ...active, type: 'factory', staff: 25, sites: 2, machines: 3, budget: 60000, tools: ['outages', 'iot'] },
    'P06:2 P09:2 P24:3', 51445, 42000],
  ['Wireless shop with fibre-only needs', { type: 'retail', pin: '302029', staff: 2, tools: ['static-ip', 'outages'] },
    'P04 P07', 1198, 0, { P09: 'DEPENDENCY', P11: 'DEPENDENCY' }],
  ['Unknown PIN and budget step-down', { pin: '999999', budget: 1000, tools: ['email', 'cloud-backup'] }, 'P01', 999, 0,
    { P02: 'ACCESS_STEP_DOWN', P16: 'BUDGET', P17: 'BUDGET' }],
  ['Messaging without GSTIN', { type: 'clinic', tools: ['whatsapp', 'sms', 'toll-free'] }, 'P02 P18', 1798, 0,
    { P13: 'GST_REQUIRED', P14: 'GST_REQUIRED', P15: 'GST_REQUIRED' }],
  ['Active GSTIN and communications', { ...active, budget: 7500, tools: ['calls', 'whatsapp', 'sms', 'toll-free'] },
    'P02 P12 P13 P14 P15', 6498, 3000],
  ['Three-site access, failover and SD-WAN', { ...active, type: 'multisite', staff: 14, sites: 3, budget: 40000,
    tools: ['outages', 'firewall'] }, 'P05:3 P09:3 P10:3 P21:3', 38994, 61500],
  ['Two-site business with central network request', { ...active, type: 'multisite', staff: 10, sites: 2, budget: 12000,
    tools: ['sdwan', 'outages'] }, 'P03:2 P09:2', 8996, 3000, { P05: 'ACCESS_STEP_DOWN', P10: 'SITES' }],
  ['Fleet tracker, mobile, website and cloud backup', { type: 'logistics', staff: 4, vehicles: 4, budget: 5000,
    tools: ['fleet', 'mobile-plus', 'website', 'cloud-backup'] }, 'P02 P08 P17 P18 P25:4', 3692, 6000],
  ['Known PIN with no supported access', { pin: '302028' }, '', 0, 0, { P01: 'COVERAGE', P04: 'COVERAGE' }, 'survey'],
  ['Four sites and a large budget gap', { sites: 4, pin: '999999', budget: 1000 }, 'P01:4', 3996, 0,
    { P02: 'ACCESS_STEP_DOWN' }, 'budget']
];

test('15 independently authored judge-style advisor profiles', async t => {
  const exercised = new Set();
  for (const [index, [name, input, bundle, monthly, setup, rejected = {}, route = 'self']] of examples.entries()) {
    await t.test(name, () => {
      const profile = { ...base, ...input };
      const quote = deriveQuote(profile);
      const selected = quote.lines.map(row => row.id).sort();
      const selection = quote.lines.map(row => row.id + (row.qty === 1 ? '' : ':' + row.qty)).sort().join(' ');
      assert.equal(selection, bundle);
      assert.deepEqual([quote.monthly, quote.setup, quote.route], [monthly, setup, route]);
      assert.equal(quote.budgetGap, Math.max(0, monthly - profile.budget));
      assert.equal(quote.exclusions.length, 25 - selected.length);
      assert.equal(new Set([...selected, ...quote.exclusions.map(row => row.id)]).size, 25);
      assert.ok(quote.exclusions.every(row => row.reason && row.hiReason));
      for (const [id, code] of Object.entries(rejected)) assert.equal(quote.exclusions.find(row => row.id === id)?.code, code);
      for (const id of selected) {
        assert.ok(skuEligible(id, { ...profile, tier: quote.area.tier, chosen: selected }));
        exercised.add(id);
      }
      if (index === 2) assert.deepEqual([quote.area.city, quote.area.tier, quote.area.code], ['Mumbai', 1, 'provisional']);
      if (index === 7) assert.equal(quote.area.code, 'provisional');
      if (index === 8) assert.equal(quote.exclusions.find(row => row.id === 'P15').alternative, 'P18');
      t.diagnostic([index + 1, name, selection || '—', monthly, setup, quote.budgetGap, route].join(' | '));
    });
  }
  assert.deepEqual([...exercised].sort(), Object.keys(catalogue).sort());
});
