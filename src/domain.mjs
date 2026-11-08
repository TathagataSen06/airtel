import { productSource, officialGst, officialUdyam, officialFixtures } from './data.mjs';

export const clock = '2026-07-15';
export const catalogueVersion = 'A26.07';
export const policyVersion = 'DEMO-KYC-v1';
export const phase = {
  advisor: 'advisor', quote: 'quote', kyc: 'kyc', checkout: 'checkout',
  tracker: 'tracker', assisted: 'assisted', closed: 'closed'
};

const item = (id, name, hi, detail, hiDetail, group) => {
  const row = productSource[id];
  return Object.freeze({
    id, name, hi, detail, hiDetail, group,
    price: Number(row.price_min_inr_per_month), setup: Number(row.one_time_setup_inr),
    term: Number(row.min_contract_months), installDays: Number(row.typical_install_days)
  });
};

export const catalogue = {
  P01: item('P01', 'Business Fibre 100', 'बिज़नेस फ़ाइबर 100', '100 Mbps for daily payments and shop operations.', 'पेमेंट और दुकान के रोज़ के काम के लिए 100 Mbps।', 'access'),
  P02: item('P02', 'Business Fibre 300', 'बिज़नेस फ़ाइबर 300', '300 Mbps for a team sharing calls and cloud tools.', 'टीम की कॉल और क्लाउड के लिए 300 Mbps।', 'access'),
  P04: item('P04', 'Business 5G fixed wireless', 'बिज़नेस 5G वायरलेस', 'Fixed wireless where fibre cannot be installed.', 'जहाँ फ़ाइबर नहीं है वहाँ वायरलेस इंटरनेट।', 'access'),
  P07: item('P07', 'Business SIM', 'बिज़नेस SIM', 'A separate mobile line for the business.', 'कारोबार के लिए अलग मोबाइल नंबर।', 'mobile'),
  P09: item('P09', '4G/5G backup', '4G/5G बैकअप', 'Automatic failover if the fibre line drops.', 'फ़ाइबर बंद होने पर अपने आप चालू होने वाला बैकअप।', 'resilience'),
  P16: item('P16', 'Cloud email', 'क्लाउड ईमेल', 'One business inbox per seat.', 'हर सीट के लिए एक बिज़नेस इनबॉक्स।', 'cloud'),
  P19: item('P19', 'Cloud POS', 'क्लाउड POS', 'Billing and stock for one checkout counter.', 'एक काउंटर के लिए बिलिंग और स्टॉक।', 'cloud'),
  P20: item('P20', 'Endpoint security', 'डिवाइस सुरक्षा', 'One protection licence per device.', 'हर डिवाइस के लिए एक सुरक्षा लाइसेंस।', 'cloud')
};

export const pins = {
  '302017': { city: 'Jaipur', hi: 'जयपुर', fibre: true, wireless: true },
  '110024': { city: 'Delhi', hi: 'दिल्ली', fibre: true, wireless: true },
  '302029': { city: 'Jaipur', hi: 'जयपुर', fibre: false, wireless: true },
  '110059': { city: 'Delhi', hi: 'दिल्ली', fibre: false, wireless: true },
  '302028': { city: 'Jaipur', hi: 'जयपुर', fibre: false, wireless: false },
  '530016': { city: 'Visakhapatnam', hi: 'विशाखापत्तनम', fibre: true, wireless: true }
};

export const slots = [
  { id: 'JUL20-AM', day: '20 Jul', hi: '20 जुलाई', week: 'Monday', hiWeek: 'सोमवार', time: '10:00–12:00 IST' },
  { id: 'JUL21-PM', day: '21 Jul', hi: '21 जुलाई', week: 'Tuesday', hiWeek: 'मंगलवार', time: '14:00–16:00 IST' },
  { id: 'JUL22-AM', day: '22 Jul', hi: '22 जुलाई', week: 'Wednesday', hiWeek: 'बुधवार', time: '10:00–12:00 IST' }
];

export const types = ['office', 'retail', 'multisite', 'factory'];
export const tools = ['hotspot', 'broadband', 'pos', 'email', 'outages', 'none'];

export const scenarios = {
  clinic: { name: 'Clinic', type: 'office', sites: 1, pin: '302017', staff: 3, tools: ['broadband', 'email', 'outages'], budget: 3000, fixture: 'D01', partner: 'JPR-07' },
  cancelled: { name: 'K01 · cancelled GSTIN', type: 'office', sites: 1, pin: '530016', staff: 3, tools: ['broadband', 'email', 'outages'], budget: 3000, fixture: 'K01', partner: 'JPR-07' },
  shop: { name: 'Shop · 5G fallback', type: 'retail', sites: 1, pin: '302029', staff: 2, tools: ['hotspot', 'pos'], budget: 1500, fixture: 'D02', partner: 'JPR-12' },
  retail: { name: 'Shop · fibre', type: 'retail', sites: 1, pin: '110024', staff: 2, tools: ['hotspot', 'pos'], budget: 1600, fixture: 'D02', partner: 'DEL-03' },
  multisite: { name: 'Multi-site · assisted', type: 'multisite', sites: 3, pin: '110024', staff: 14, tools: ['broadband', 'pos', 'outages'], budget: 12000, fixture: 'D01', partner: 'DEL-03' },
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

function coverage(pin) {
  const entry = pins[pin];
  if (!entry) return { code: 'unknown', city: '', hi: '' };
  return { ...entry, code: entry.fibre ? 'fibre' : entry.wireless ? 'wireless' : 'none' };
}

export function skuEligible(id, { tier = 2, staff = 1, sites = 1, gstVerified = false, chosen = [] } = {}) {
  const row = productSource[id];
  if (!row || !row.available_city_tiers.split(';').includes(String(tier))) return false;
  if (staff < Number(row.min_employees) || sites < Number(row.min_sites)) return false;
  if (row.requires_gstin === 'Y' && !gstVerified) return false;
  return !row.requires_one_of || row.requires_one_of.split('|').some(id => chosen.includes(id));
}

export function deriveQuote(profile, options = {}) {
  const area = coverage(profile.pin);
  const assisted = profile.sites > 1 || ['multisite', 'factory'].includes(profile.type);
  const base = area.fibre ? profile.type === 'office' ? 'P02' : 'P01' : area.wireless ? 'P04' : null;
  const route = assisted ? 'complex' : !base ? 'survey' : 'self';
  if (route !== 'self') return { route, area, lines: [], monthly: 0, setup: 0, options: {}, version: catalogueVersion };

  const seats = Math.min(Math.max(profile.staff, 1), 20);
  const isOffice = profile.type === 'office';
  const eligibility = { tier: area.city === 'Delhi' ? 1 : 2, staff: profile.staff, sites: profile.sites, chosen: [base] };
  const canBackup = isOffice && skuEligible('P09', eligibility);
  const officePlan = catalogue[base].price + seats * (catalogue.P16.price + catalogue.P20.price);
  const fullBackup = canBackup && (profile.tools.includes('outages') || profile.budget >= officePlan + catalogue.P09.price);
  const selected = {
    backup: canBackup && (options.backup ?? fullBackup),
    pos: !isOffice && (options.pos ?? false)
  };
  const lines = [];
  const add = (sku, qty = 1, toggle = null) => {
    requireRule(skuEligible(sku, eligibility), 'SKU_INELIGIBLE');
    const row = catalogue[sku];
    lines.push({ ...row, qty, toggle, monthly: row.price * qty, oneTime: row.setup * qty });
  };
  add(base);
  if (isOffice) {
    add('P16', seats);
    add('P20', seats);
    if (selected.backup) add('P09', 1, 'backup');
  } else {
    add('P07');
    if (selected.pos) add('P19', 1, 'pos');
  }
  const monthly = lines.reduce((sum, row) => sum + row.monthly, 0);
  const setup = lines.reduce((sum, row) => sum + row.oneTime, 0);
  return {
    route, area, lines, monthly, setup, seats, options: selected, canBackup, canPos: !isOffice,
    budgetGap: Math.max(0, monthly - profile.budget), version: catalogueVersion
  };
}

export function priority(state) {
  let score = 15;
  const reasons = [];
  if (Object.keys(state.profile).length >= 6) { score += 25; reasons.push('Needs captured'); }
  if (state.quote?.area.code === 'fibre' || state.quote?.area.code === 'wireless') {
    score += 20; reasons.push('Serviceability signal');
  }
  if (state.profile.budget >= 2500) { score += 15; reasons.push('Budget ≥ ₹2,500'); }
  if (state.assist?.type === 'complex') { score += 20; reasons.push('Complex account'); }
  return { score, reasons };
}

export const kinds = ['gst', 'udyam', 'id', 'address'];

const suffix = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
function gstCheck(input) {
  let factor = 2;
  let sum = 0;
  for (const char of input.split('').reverse()) {
    const value = suffix.indexOf(char) * factor;
    sum += Math.floor(value / 36) + (value % 36);
    factor = factor === 2 ? 1 : 2;
  }
  return suffix[(36 - sum % 36) % 36];
}

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
  if (gstin) demoTax[gstin] = [legal, legal, address, 'Rajasthan', 'Active'];
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
demoTax[replacementGst] = [...originalTax.slice(0, 4), 'Active'];
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

function looksLikeOneOcrError(read, expected) {
  if (read.length !== expected.length || !expected) return false;
  const differences = Array.from(read).filter((char, i) => char !== expected[i]).length;
  return differences === 1;
}

export function evaluateEvidence(fixture, documents) {
  const policy = specimens[fixture];
  requireRule(policy, 'UNKNOWN_FIXTURE');
  const checks = [];
  const check = (name, state, reason, reference) => checks.push({ name, state, reason, ...(reference ? { reference } : {}) });
  const { gst, udyam, id, address } = documents ?? {};
  for (const [kind, doc, required] of [['gst', gst, policy.requireGst], ['udyam', udyam, policy.requireUdyam], ['id', id, true], ['address', address, true]]) {
    if (!has(doc) && required) check(kind, 'correction', 'PROOF_MISSING');
    const optionalBlank = kind === 'udyam' && !required && !field(doc, 'UDYAM');
    if (has(doc) && !optionalBlank && (!Number.isFinite(doc.confidence) || doc.confidence < 73)) check(kind, 'review', 'OCR_LOW_CONFIDENCE');
  }
  const gstin = compact(field(gst, 'GSTIN'));
  const udyamNo = compact(field(udyam, 'UDYAM')).replace(/^(UDYAM)([A-Z]{2})([0-9]{2})([0-9]{7})$/, '$1-$2-$3-$4');
  const tax = officialGst[gstin] ?? demoTax[gstin];
  const msme = officialUdyam[udyamNo] ?? demoUdyam[udyamNo];
  const expectedTax = officialGst[policy.gstin] ?? demoTax[policy.gstin];

  if (has(gst)) {
    if (!tax && expectedTax?.[4] === 'Cancelled' && looksLikeOneOcrError(gstin, policy.gstin)) {
      check('gst', 'review', 'GST_CANCELLED_CANDIDATE', mask(policy.gstin));
    } else if (!/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]$/.test(gstin) || gstCheck(gstin.slice(0, -1)) !== gstin.slice(-1)) {
      check('gst', 'correction', 'GST_FORMAT', mask(gstin));
    } else if (!tax) {
      check('gst', 'review', 'REGISTRY_UNAVAILABLE', mask(gstin));
    } else if (tax[4] !== 'Active') {
      check('gst', 'review', tax[4] === 'Cancelled' ? 'GST_CANCELLED' : 'GST_SUSPENDED', mask(gstin));
    } else if (gstin !== policy.gstin || compact(tax[0]) !== compact(field(gst, 'LEGAL NAME')) ||
      compact(tax[2]) !== compact(field(gst, 'ADDRESS'))) {
      check('gst', 'correction', 'GST_DETAILS', mask(gstin));
    } else check('gst', 'pass', 'GST_ACTIVE', mask(gstin));
  } else if (!policy.requireGst) check('gst', 'pass', 'NOT_REQUIRED');

  if (has(udyam) && (udyamNo || policy.requireUdyam)) {
    if (!/^UDYAM-[A-Z]{2}-00-\d{7}$/.test(udyamNo)) check('udyam', 'correction', 'UDYAM_FORMAT', mask(udyamNo));
    else if (!msme) check('udyam', 'review', 'REGISTRY_UNAVAILABLE', mask(udyamNo));
    else if (udyamNo !== policy.udyam || compact(msme[0]) !== compact(field(udyam, 'LEGAL NAME')) ||
      (expectedTax && compact(expectedTax[3]) !== compact(msme[1]))) {
      check('udyam', 'correction', 'UDYAM_DETAILS', mask(udyamNo));
    } else check('udyam', 'pass', 'UDYAM_ACTIVE', mask(udyamNo));
  } else if (!policy.requireUdyam) check('udyam', 'pass', 'NOT_REQUIRED');

  if (has(id)) {
    const signer = field(id, 'SIGNATORY NAME');
    const idRef = compact(field(id, 'SIGNATORY ID'));
    if (!/^SYNID\d{6}$/.test(idRef) || compact(signer) !== compact(policy.signer) ||
      compact(field(id, 'TRADE NAME')) !== compact(policy.name)) check('id', 'correction', 'SIGNATORY_MISMATCH', mask(idRef));
    else check('id', 'pass', 'SIGNATORY_MATCH', mask(idRef));
  }
  if (has(address)) {
    const date = field(address, 'ISSUE DATE').replace(/ /g, '');
    const parsed = /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Date(date + 'T00:00:00Z') : null;
    const validDate = parsed && Number.isFinite(parsed.valueOf()) && parsed.toISOString().slice(0, 10) === date;
    const age = validDate ? (Date.parse(clock) - parsed.valueOf()) / 86400000 : NaN;
    if (!Number.isFinite(age) || age > 90 || age < 0) check('address', 'correction', 'ADDRESS_STALE');
    else {
      const name = compact(field(address, 'LEGAL NAME'));
      const expectedAddress = expectedTax?.[2] ?? policy.address;
      if (!name || ![policy.name, expectedTax?.[0]].map(compact).includes(name)) check('address', 'correction', 'LEGAL_NAME_MISMATCH');
      else if (!expectedAddress || compact(field(address, 'ADDRESS')) !== compact(expectedAddress)) check('address', 'correction', 'ADDRESS_MISMATCH');
      else check('address', 'pass', 'ADDRESS_VALID');
    }
  }
  const status = checks.some((row) => row.state === 'review') ? 'review' :
    checks.some((row) => row.state === 'correction') ? 'correction' : 'cleared';
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
