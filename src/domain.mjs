import { officialGst, officialUdyam, officialFixtures, propensityModel } from './data.mjs';
import { gstCheck, gstinValid } from '../public/gst-format.mjs';
export { gstinValid } from '../public/gst-format.mjs';
export { catalogue, catalogueVersion, types, tools, deriveQuote, skuEligible } from './catalogue.mjs';
export { pins } from './geography.mjs';

export const clock = '2026-07-15';
export const policyVersion = 'DEMO-KYC-v1';
export const phase = {
  advisor: 'advisor', quote: 'quote', kyc: 'kyc', checkout: 'checkout',
  tracker: 'tracker', assisted: 'assisted', closed: 'closed'
};

export const slots = [
  { id: 'JUL20-AM', day: '20 Jul', hi: '20 जुलाई', week: 'Monday', hiWeek: 'सोमवार', time: '10:00–12:00 IST' },
  { id: 'JUL21-PM', day: '21 Jul', hi: '21 जुलाई', week: 'Tuesday', hiWeek: 'मंगलवार', time: '14:00–16:00 IST' },
  { id: 'JUL22-AM', day: '22 Jul', hi: '22 जुलाई', week: 'Wednesday', hiWeek: 'बुधवार', time: '10:00–12:00 IST' }
];

export const scenarios = {
  clinic: { name: 'Clinic', type: 'clinic', sites: 1, pin: '302017', staff: 3, tools: ['broadband', 'email', 'security', 'outages'], budget: 3000, fixture: 'D01', partner: 'JPR-07' },
  cancelled: { name: 'K01 · cancelled GSTIN', type: 'office', sites: 1, pin: '530016', staff: 3, tools: ['broadband', 'email', 'security', 'outages'], budget: 3000, fixture: 'K01', partner: 'JPR-07' },
  shop: { name: 'Shop · 5G fallback', type: 'retail', sites: 1, pin: '302029', staff: 2, tools: ['hotspot'], budget: 1500, fixture: 'D02', partner: 'JPR-12' },
  retail: { name: 'Shop · fibre', type: 'retail', sites: 1, pin: '110024', staff: 2, tools: ['hotspot'], budget: 1600, fixture: 'D02', partner: 'DEL-03' },
  multisite: { name: 'Multi-site · per-site quote', type: 'multisite', sites: 3, pin: '110024', staff: 14, tools: ['broadband', 'pos', 'outages'], budget: 12000, fixture: 'D01', partner: 'DEL-03' },
  survey: { name: 'Out of footprint', type: 'office', sites: 1, pin: '302028', staff: 4, tools: ['hotspot'], budget: 3000, fixture: 'D01', partner: 'JPR-07' }
};

export class DomainError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}

function requireRule(test, code, status) {
  if (!test) throw new DomainError(code, status);
}

export function priority(state) {
  const { profile, quote } = state;
  if (!quote || !profile.staff || !profile.sites) return { score: null, reasons: [] };
  const needs = new Set(profile.tools || []);
  const input = {
    log_staff: Math.log1p(profile.staff), log_sites: Math.log1p(profile.sites),
    tier_one: Number(quote.area.tier === 1), active_gst: Number(profile.gstVerified === true),
    weak_internet: Number(needs.has('hotspot') || (Array.isArray(profile.tools) && !needs.has('broadband') && needs.size === 0)),
    addon_interests: [...needs].filter(key => !['hotspot', 'broadband', 'none', 'leased-line', 'gigabit'].includes(key)).length
  };
  const labels = ['Team size', 'Site count', 'City tier', 'GST registration', 'Current connectivity', 'Add-on interests'];
  const effects = propensityModel.features.map((key, i) => ({
    effect: propensityModel.weights[i] * (input[key] - propensityModel.means[i]) / propensityModel.scales[i],
    label: labels[i]
  }));
  const logOdds = effects.reduce((sum, item) => sum + item.effect, propensityModel.intercept);
  const reasons = effects.sort((a, b) => Math.abs(b.effect) - Math.abs(a.effect)).slice(0, 2)
    .map(item => `${item.label} ${item.effect >= 0 ? '↑' : '↓'}`);
  return { score: Math.round(1000 / (1 + Math.exp(-logOdds))) / 10, reasons };
}

export const kinds = ['gst', 'udyam', 'id', 'address'];

function gstFor(state, n) {
  const code = state + 'DMYPS' + String(8100 + n) + 'A1Z';
  return code + gstCheck(code);
}

export const specimens = { ...officialFixtures };
const demoTax = {};
const demoUdyam = {};

function createDemo(key, legal, signer, registered) {
  const address = '21 PILOT ROAD, JAIPUR, RAJASTHAN - 302017';
  const gstin = registered ? gstFor('08', 31) : '';
  const udyam = registered ? 'UDYAM-RJ-00-0000131' : '';
  if (gstin) demoTax[gstin] = [legal, legal, address, 'Rajasthan', 'Active', signer];
  if (udyam) demoUdyam[udyam] = [legal, 'Rajasthan'];
  return {
    name: legal, signer, address, gstin, udyam, requireGst: registered, requireUdyam: registered,
    description: registered ? 'Clean clinic walkthrough specimen' : 'Unregistered shop walkthrough specimen',
    fields: {
      gst: gstin ? { GSTIN: gstin, 'LEGAL NAME': legal, ADDRESS: address } : null,
      udyam: udyam ? { UDYAM: udyam, 'LEGAL NAME': legal } : null,
      id: { 'SIGNATORY ID': 'SYN-ID-' + (registered ? '000131' : '000132'), 'SIGNATORY NAME': signer, 'TRADE NAME': legal },
      address: { 'LEGAL NAME': legal, ADDRESS: address, 'ISSUE DATE': '2026-07-01' }
    }
  };
}
specimens.D01 = createDemo('D01', 'PILOT FAMILY CLINIC', 'N R SHARMA', true);
specimens.D02 = createDemo('D02', 'PILOT CORNER SHOP', 'K A VERMA', false);
const replacementGst = gstFor('37', 41);
const originalTax = officialGst[officialFixtures.K01.gstin];
demoTax[replacementGst] = [...originalTax.slice(0, 4), 'Active', originalTax[5] || officialFixtures.K01.signer];
specimens.K01R = {
  ...officialFixtures.K01, gstin: replacementGst, description: 'Simulated K01 replacement certificate',
  fields: { ...officialFixtures.K01.fields,
    gst: { GSTIN: replacementGst, 'LEGAL NAME': originalTax[0], 'TRADE NAME': originalTax[1], ADDRESS: originalTax[2] } }
};
specimens.K05R = {
  ...officialFixtures.K05, description: 'Simulated K05 reissued Udyam proof',
  fields: { ...officialFixtures.K05.fields,
    udyam: { UDYAM: officialFixtures.K05.udyam, 'LEGAL NAME': officialUdyam[officialFixtures.K05.udyam][0] } }
};

const tidy = (value) => typeof value === 'string' ? value.toUpperCase().trim().replace(/\s+/g, ' ').slice(0, 180) : '';
const field = (doc, key) => tidy(doc?.fields?.[key]);
const compact = (value) => tidy(value).replace(/[^A-Z0-9]/g, '');
const mask = (value) => value ? value.slice(0, 2) + '••••••' + value.slice(-4) : '';
const has = (doc) => doc?.synthetic === true;

export function checkRegistration(value) {
  if (typeof value !== 'string' || !value.trim()) return { gstVerified: false, gstStatus: 'none' };
  const id = value.trim().toUpperCase();
  const record = gstinValid(id) ? officialGst[id] ?? demoTax[id] : null;
  const gstStatus = record?.[4]?.toLowerCase() || (gstinValid(id) ? 'not_found' : 'invalid');
  return { gstVerified: gstStatus === 'active', gstStatus, gstReference: id.length === 15 ? mask(id) : undefined };
}

const gstStates = {
  '01': 'Jammu and Kashmir', '02': 'Himachal Pradesh', '03': 'Punjab', '04': 'Chandigarh', '05': 'Uttarakhand',
  '06': 'Haryana', '07': 'Delhi', '08': 'Rajasthan', '09': 'Uttar Pradesh', '10': 'Bihar', '11': 'Sikkim',
  '12': 'Arunachal Pradesh', '13': 'Nagaland', '14': 'Manipur', '15': 'Mizoram', '16': 'Tripura',
  '17': 'Meghalaya', '18': 'Assam', '19': 'West Bengal', '20': 'Jharkhand', '21': 'Odisha',
  '22': 'Chhattisgarh', '23': 'Madhya Pradesh', '24': 'Gujarat', '26': 'Dadra and Nagar Haveli and Daman and Diu',
  '27': 'Maharashtra', '29': 'Karnataka', '30': 'Goa', '31': 'Lakshadweep', '32': 'Kerala',
  '33': 'Tamil Nadu', '34': 'Puducherry', '35': 'Andaman and Nicobar Islands',
  '36': 'Telangana', '37': 'Andhra Pradesh', '38': 'Ladakh'
};

const stateLabels = Object.entries(gstStates).map(([code, name]) => [code, compact(name)])
  .sort((a, b) => b[1].length - a[1].length);

function stateOf(address) {
  const normalized = compact(address);
  return stateLabels.find(([, label]) => normalized.includes(label))?.[0] || '';
}

const same = (left, right) => Boolean(compact(left) && compact(left) === compact(right));
const lookupTax = id => officialGst[id] ?? demoTax[id];
const lookupUdyam = id => officialUdyam[id] ?? demoUdyam[id];

export function readEvidenceGstin(documents) {
  return compact(field(documents?.gst, 'GSTIN'));
}

function closeGstRead(read, id) {
  if (read.length !== id.length || read.length !== 15) return false;
  const confusable = ['0O', '1IL', '2Z', '5S', '6G', '8B'];
  let changes = 0;
  for (let i = 0; i < id.length; i++) {
    if (read[i] === id[i] || confusable.some(group => group.includes(read[i]) && group.includes(id[i]))) continue;
    if (++changes > 1) return false;
  }
  return read !== id;
}

function nearbyTax(id, gst) {
  const candidates = [];
  for (const directory of [officialGst, demoTax]) {
    for (const [key, record] of Object.entries(directory)) {
      const matchesBusiness = same(record[0], field(gst, 'LEGAL NAME')) || same(record[1], field(gst, 'TRADE NAME'));
      if (closeGstRead(id, key) || (matchesBusiness && same(record[2], field(gst, 'ADDRESS')))) {
        candidates.push({ key, record, matchesBusiness });
      }
    }
  }
  const corroborated = candidates.filter(row => row.matchesBusiness);
  return corroborated.length === 1 ? corroborated[0] : candidates.length === 1 ? candidates[0] : null;
}

function evidenceDate(value) {
  const iso = value.replace(/ /g, '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return NaN;
  const date = new Date(iso + 'T00:00:00Z');
  return Number.isFinite(date.valueOf()) && date.toISOString().slice(0, 10) === iso ? date.valueOf() : NaN;
}

export function evaluateEvidence(requirements, documents) {
  const fixture = typeof requirements === 'string' ? specimens[requirements] : null;
  if (typeof requirements === 'string') requireRule(fixture, 'UNKNOWN_FIXTURE');
  const required = {
    gst: Boolean(fixture?.requireGst || requirements?.gst),
    udyam: Boolean(fixture?.requireUdyam || requirements?.udyam),
    id: true, address: true
  };
  const checks = [];
  const check = (name, state, reason, reference, tamper = false) =>
    checks.push({ name, state, reason, ...(reference ? { reference } : {}), ...(tamper ? { tamper } : {}) });
  const usable = {};
  for (const kind of kinds) {
    const doc = documents?.[kind];
    if (doc?.quality === 'blurred') {
      check(kind, 'correction', 'OCR_BLUR');
      continue;
    }
    if (!has(doc)) {
      if (required[kind]) check(kind, 'correction', 'PROOF_MISSING');
      else check(kind, 'pass', 'NOT_REQUIRED');
      continue;
    }
    if (kind === 'udyam' && !required.udyam && !field(doc, 'UDYAM')) {
      check(kind, 'pass', 'NOT_REQUIRED');
      continue;
    }
    usable[kind] = doc;
  }
  const { gst, udyam, id, address } = usable;
  const gstin = readEvidenceGstin(usable);
  const udyamNo = compact(field(udyam, 'UDYAM')).replace(/^(UDYAM)([A-Z]{2})([0-9]{2})([0-9]{7})$/, '$1-$2-$3-$4');
  const tax = gstinValid(gstin) ? lookupTax(gstin) : null;
  const msme = /^UDYAM-[A-Z]{2}-00-\d{7}$/.test(udyamNo) ? lookupUdyam(udyamNo) : null;
  const gstAddress = field(gst, 'ADDRESS');
  const billedAddress = field(address, 'ADDRESS');
  const trade = field(gst, 'TRADE NAME');
  const billName = field(address, 'LEGAL NAME');
  const proofNames = [tax?.[0], tax?.[1], msme?.[0], trade].filter(Boolean);
  const near = gst && gstin && !tax ? nearbyTax(gstin, gst) : null;

  if (gst) {
    const checksum = gstinValid(gstin);
    const regionCode = gstin.slice(0, 2);
    const states = [stateOf(gstAddress), stateOf(billedAddress), stateOf(tax?.[3])].filter(Boolean);
    if (gstStates[regionCode] && states.some(code => code !== regionCode)) {
      check('gst', 'review', 'GST_STATE_MISMATCH', mask(gstin), true);
    } else if (!tax) {
      if (near?.record[4] === 'Cancelled' && closeGstRead(gstin, near.key)) {
        check('gst', 'review', 'GST_CANCELLED_CANDIDATE', mask(near.key), true);
      } else if (near && gstin) {
        check('gst', 'correction', checksum ? 'GST_REGISTRY_MISMATCH' : 'GSTIN_NEAR_MATCH', mask(gstin), true);
      } else if (!checksum) check('gst', 'correction', 'GST_FORMAT', mask(gstin));
      else check('gst', 'review', 'REGISTRY_UNAVAILABLE', mask(gstin));
    } else if (tax[4] !== 'Active') {
      check('gst', 'review', tax[4] === 'Cancelled' ? 'GST_CANCELLED' : 'GST_SUSPENDED', mask(gstin));
    } else if (!same(tax[0], field(gst, 'LEGAL NAME')) || (trade && !same(tax[1], trade))) {
      check('gst', 'correction', 'GST_LEGAL_TRADE_MISMATCH', mask(gstin));
    } else if (!same(tax[2], gstAddress)) {
      check('gst', 'correction', 'GST_DETAILS', mask(gstin));
    } else check('gst', 'pass', 'GST_ACTIVE', mask(gstin));
  }

  if (udyam) {
    const names = [tax?.[0], tax?.[1], trade, billName].filter(Boolean);
    const correctState = !tax || same(tax[3], msme?.[1]);
    if (!/^UDYAM-[A-Z]{2}-00-\d{7}$/.test(udyamNo)) check('udyam', 'correction', 'UDYAM_FORMAT', mask(udyamNo));
    else if (!msme) check('udyam', 'review', 'REGISTRY_UNAVAILABLE', mask(udyamNo));
    else if (!same(msme[0], field(udyam, 'LEGAL NAME')) || !correctState ||
      (names.length && !names.some(name => same(name, msme[0])))) {
      check('udyam', 'correction', 'UDYAM_DETAILS', mask(udyamNo));
    } else check('udyam', 'pass', 'UDYAM_ACTIVE', mask(udyamNo));
  }

  if (id) {
    const idRef = compact(field(id, 'SIGNATORY ID'));
    const signer = field(id, 'SIGNATORY NAME');
    const business = field(id, 'TRADE NAME');
    const corroborated = near?.matchesBusiness && same(gstAddress, near.record[2]) && same(billedAddress, near.record[2]);
    const record = tax || (corroborated ? near.record : null);
    const authority = record?.[5] || (record?.[0] || '').match(/^(.+?)\s*\(\s*PROP\b/i)?.[1];
    const anchors = [...proofNames, billName];
    const expiry = field(id, 'VALID UNTIL');
    if (!/^SYNID\d{6}$/.test(idRef) || !signer || (authority && !same(signer, authority)) ||
      !anchors.some(name => same(name, business))) {
      check('id', 'correction', 'SIGNATORY_MISMATCH', mask(idRef));
    } else if (expiry && !(evidenceDate(expiry) >= Date.parse(clock))) {
      check('id', 'correction', 'SIGNATORY_EXPIRED', mask(idRef));
    } else check('id', 'pass', 'SIGNATORY_MATCH', mask(idRef));
  }

  if (address) {
    const age = (Date.parse(clock) - evidenceDate(field(address, 'ISSUE DATE'))) / 86400000;
    const names = [...proofNames, field(id, 'TRADE NAME')];
    const addresses = [tax?.[2], gstAddress].filter(Boolean);
    if (!Number.isFinite(age) || age > 90 || age < 0) check('address', 'correction', 'ADDRESS_STALE');
    else if (!names.some(name => same(name, billName))) check('address', 'correction', 'LEGAL_NAME_MISMATCH');
    else if (!billedAddress || addresses.some(expected => !same(expected, billedAddress))) {
      check('address', 'correction', 'ADDRESS_MISMATCH');
    } else check('address', 'pass', 'ADDRESS_VALID');
  }
  const status = checks.some(row => row.state === 'review') ? 'review' :
    checks.some(row => row.state === 'correction') ? 'correction' : 'cleared';
  return { status, checks };
}

export function publicSpecimen(id) {
  const p = specimens[id];
  if (!p) return null;
  const files = { ...p.files };
  for (const kind of Object.keys(p.fields ?? {})) if (p.fields[kind]) delete files[kind];
  return { id, name: p.name, description: p.description, files, fields: p.fields ?? {},
    required: { gst: p.requireGst, udyam: p.requireUdyam, id: true, address: true } };
}
