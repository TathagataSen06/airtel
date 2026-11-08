import { productSource } from './data.mjs';
import { coverage } from './geography.mjs';

const catalogueOverlay = {
  P01: ['Business Fibre 100', 'बिज़नेस फ़ाइबर 100', '100 Mbps for daily payments and shop operations.', 'पेमेंट और दुकान के रोज़ के काम के लिए 100 Mbps।'],
  P02: ['Business Fibre 300', 'बिज़नेस फ़ाइबर 300', '300 Mbps for a team sharing calls and cloud tools.', 'टीम की कॉल और क्लाउड के लिए 300 Mbps।'],
  P04: ['Business 5G fixed wireless', 'बिज़नेस 5G वायरलेस', 'Fixed wireless where fibre cannot be installed.', 'जहाँ फ़ाइबर नहीं है वहाँ वायरलेस इंटरनेट।'],
  P07: ['Business SIM', 'बिज़नेस SIM', 'A separate mobile line for the business.', 'कारोबार के लिए अलग मोबाइल नंबर।'],
  P09: ['4G/5G backup', '4G/5G बैकअप', 'Automatic failover if the fibre line drops.', 'फ़ाइबर बंद होने पर अपने आप चालू होने वाला बैकअप।'],
  P16: ['Cloud email', 'क्लाउड ईमेल', 'One business inbox per seat.', 'हर सीट के लिए एक बिज़नेस इनबॉक्स।'],
  P19: ['Cloud POS', 'क्लाउड POS', 'Billing and stock for one checkout counter.', 'एक काउंटर के लिए बिलिंग और स्टॉक।'],
  P20: ['Endpoint security', 'डिवाइस सुरक्षा', 'One protection licence per device.', 'हर डिवाइस के लिए एक सुरक्षा लाइसेंस।']
};

const accessIds = ['P01', 'P02', 'P03', 'P04', 'P05', 'P06'];
const groups = { P07: 'mobile', P08: 'mobile', P09: 'resilience', P10: 'network', P11: 'network' };

export const catalogueVersion = 'A26.08';
export const catalogue = Object.fromEntries(Object.entries(productSource).map(([id, row]) => {
  const [name, hi, detail, hiDetail] = catalogueOverlay[id] || [row.product_name, '', row.description, ''];
  return [id, Object.freeze({
    id, name, hi: hi || name, detail, hiDetail: hiDetail || detail,
    group: accessIds.includes(id) ? 'access' : groups[id] || 'cloud',
    unit: row.unit,
    price: Number(row.price_min_inr_per_month), setup: Number(row.one_time_setup_inr),
    term: Number(row.min_contract_months), installDays: Number(row.typical_install_days),
    gstRequired: row.requires_gstin === 'Y'
  })];
}));

export const types = ['office', 'clinic', 'retail', 'restaurant', 'warehouse', 'factory', 'multisite', 'salon', 'pharmacy', 'coaching', 'hotel', 'logistics'];
export const tools = ['hotspot', 'broadband', 'none', 'outages', 'pos', 'email', 'cctv', 'guest-wifi', 'static-ip',
  'firewall', 'sdwan', 'calls', 'whatsapp', 'sms', 'toll-free', 'iot', 'fleet', 'website', 'cloud-backup',
  'security', 'business-sim', 'mobile-plus', 'leased-line', 'gigabit'];

const retailTypes = new Set(['retail', 'restaurant', 'salon', 'pharmacy']);
const needRules = [
  ['P09', 'outages'], ['P10', 'sdwan'], ['P11', 'static-ip'], ['P12', 'calls'], ['P13', 'toll-free'],
  ['P14', 'sms'], ['P15', 'whatsapp'], ['P16', 'email'], ['P17', 'cloud-backup'], ['P18', 'website'],
  ['P19', 'pos'], ['P20', 'security'], ['P21', 'firewall'], ['P22', 'guest-wifi'], ['P23', 'cctv'],
  ['P24', 'iot'], ['P25', 'fleet']
];
const dropOrder = ['P18', 'P13', 'P14', 'P17', 'P11', 'P15', 'P22', 'P23', 'P19', 'P08', 'P07',
  'P12', 'P16', 'P20', 'P25', 'P24', 'P21', 'P10', 'P09'];
const quoteReasons = {
  GST_REQUIRED: ['An active GSTIN is required.', 'सक्रिय GSTIN ज़रूरी है।'],
  TIER: ['This product is unavailable in this city tier.', 'यह सेवा इस शहर की श्रेणी में उपलब्ध नहीं है।'],
  STAFF: ['This product needs a larger team.', 'इस सेवा के लिए बड़ी टीम चाहिए।'],
  SITES: ['This product needs more business sites.', 'इस सेवा के लिए अधिक व्यावसायिक स्थान चाहिए।'],
  DEPENDENCY: ['This product needs a compatible access plan in the bundle.', 'इसके लिए प्लान में संगत इंटरनेट सेवा चाहिए।'],
  COVERAGE: ['This access type is unavailable at the supplied PIN.', 'इस PIN पर यह इंटरनेट सेवा उपलब्ध नहीं है।'],
  COVERAGE_UNCONFIRMED: ['Wireless coverage is unconfirmed. The estimate assumes fibre.', 'वायरलेस कवरेज की पुष्टि नहीं हुई है। अनुमान फ़ाइबर पर आधारित है।'],
  BUDGET: ['Removed to lower the monthly price.', 'मासिक कीमत कम करने के लिए हटाया गया।'],
  ACCESS_STEP_DOWN: ['Replaced with a lower-cost access plan to fit the budget.', 'बजट में रहने के लिए कम कीमत वाला इंटरनेट चुना गया।'],
  OWNER_CHOICE: ['Left out at your request.', 'आपके चुनाव के अनुसार शामिल नहीं किया गया।'],
  ALTERNATIVE: ['Another eligible access plan was selected.', 'एक अन्य योग्य इंटरनेट प्लान चुना गया।'],
  SECTOR: ['This option is offered for a different business need.', 'यह विकल्प दूसरी व्यावसायिक ज़रूरत के लिए है।'],
  NOT_REQUESTED: ['No matching need was selected.', 'इससे जुड़ी कोई ज़रूरत नहीं चुनी गई।']
};

function eligibilityIssue(id, { tier = 2, staff = 1, sites = 1, gstVerified = false, chosen = [] } = {}) {
  const row = productSource[id];
  if (!row || !row.available_city_tiers.split(';').includes(String(tier))) return 'TIER';
  if (row.requires_gstin === 'Y' && !gstVerified) return 'GST_REQUIRED';
  if (staff < Number(row.min_employees)) return 'STAFF';
  if (sites < Number(row.min_sites)) return 'SITES';
  if (row.requires_one_of && !row.requires_one_of.split('|').some(dep => chosen.includes(dep))) return 'DEPENDENCY';
  return null;
}

export function skuEligible(id, context) {
  return eligibilityIssue(id, context) === null;
}

const quantities = {
  P11: profile => profile.sites,
  P16: profile => profile.staff,
  P20: profile => profile.staff,
  P23: profile => profile.cameras || profile.sites,
  P24: profile => profile.machines || profile.sites,
  P25: profile => profile.vehicles || profile.sites
};

function lineFor(id, profile, toggle = null) {
  const item = catalogue[id];
  const qty = quantities[id]?.(profile) ?? (item.unit === 'per site' ? profile.sites : 1);
  return { ...item, qty, toggle, monthly: item.price * qty, oneTime: item.setup * qty };
}

export function deriveQuote(profile, options = {}) {
  const area = coverage(profile.pin, profile.city);
  const { staff, sites, budget, type } = profile;
  const needs = new Set([...(profile.tools || []), ...(profile.needs || [])]);
  const facts = { tier: area.tier, staff, sites, gstVerified: profile.gstVerified === true };
  const exclusions = new Map();
  const requested = new Set();
  const explain = (id, code, alternative) => {
    const [reason, hiReason] = quoteReasons[code];
    exclusions.set(id, { id, name: catalogue[id].name, hi: catalogue[id].hi, code, reason, hiReason,
      ...(alternative ? { alternative } : {}) });
  };

  const fibreLadder = staff >= 3 ? ['P02', 'P01'] : ['P01'];
  if (staff >= 5 || needs.has('gigabit')) fibreLadder.unshift('P03');
  if (needs.has('leased-line') || staff >= 10) {
    fibreLadder.unshift('P05');
    if (staff >= 25) fibreLadder.unshift('P06');
  }
  const ladder = area.fibre ? fibreLadder : area.wireless ? ['P04'] : [];
  for (const id of ladder) {
    requested.add(id);
    if (!skuEligible(id, facts)) explain(id, eligibilityIssue(id, facts));
  }
  for (const id of accessIds) {
    if ((id === 'P04' && !area.wireless) || (id !== 'P04' && !area.fibre)) {
      explain(id, !area.confirmed && id === 'P04' ? 'COVERAGE_UNCONFIRMED' : 'COVERAGE');
      if (id === 'P04' || fibreLadder.includes(id)) requested.add(id);
    }
  }
  const eligibleAccess = ladder.filter(id => skuEligible(id, facts));
  let access = eligibleAccess[0];
  const wants = new Set(needRules.filter(([, need]) => needs.has(need)).map(([id]) => id));
  if (needs.has('mobile-plus')) wants.add('P08');
  else if (needs.has('business-sim') || retailTypes.has(type)) wants.add('P07');
  if (sites >= 3) wants.add('P10');
  if (needs.has('whatsapp') && !facts.gstVerified) {
    wants.add('P18');
    explain('P15', 'GST_REQUIRED', 'P18');
  }
  const offered = new Set([...wants, 'P09', ...(retailTypes.has(type) || type === 'multisite' ? ['P19'] : [])]);
  const option = id => options[id] ?? (id === 'P09' ? options.backup : id === 'P19' ? options.pos : undefined);
  const dropped = new Set();

  function buildLines(base) {
    if (!base) return [];
    const lines = [lineFor(base, profile)];
    const context = { ...facts, chosen: [base] };
    for (const id of offered) {
      const issue = eligibilityIssue(id, context);
      if (id === 'P24' && type !== 'factory') explain(id, 'SECTOR');
      else if (!skuEligible(id, context)) explain(id, issue, id === 'P15' && issue === 'GST_REQUIRED' ? 'P18' : undefined);
      else if (option(id) === false) explain(id, 'OWNER_CHOICE');
      else if (dropped.has(id)) explain(id, 'BUDGET');
      else if (option(id) === true || wants.has(id)) {
        exclusions.delete(id);
        lines.push(lineFor(id, profile, id));
        context.chosen.push(id);
      }
    }
    return lines;
  }

  const subtotal = lines => lines.reduce((sum, row) => sum + row.monthly, 0);
  let lines = buildLines(access);
  for (const id of dropOrder) {
    if (subtotal(lines) <= budget) break;
    if (!lines.some(row => row.id === id) || option(id) === true || (id === 'P07' && option('P19') === true)) continue;
    dropped.add(id);
    lines = buildLines(access);
  }
  for (const next of eligibleAccess.slice(1)) {
    if (subtotal(lines) <= budget) break;
    explain(access, 'ACCESS_STEP_DOWN', next);
    access = next;
    lines = buildLines(access);
  }
  // Reconsider requested extras in priority order after an access change frees room.
  for (const id of [...dropped].reverse()) {
    dropped.delete(id);
    const candidate = buildLines(access);
    if (subtotal(candidate) <= budget) lines = candidate;
    else dropped.add(id);
  }
  lines = buildLines(access);

  const monthly = subtotal(lines);
  const setup = lines.reduce((sum, row) => sum + row.oneTime, 0);
  const budgetGap = Math.max(0, monthly - budget);
  const route = !access ? 'survey' : budgetGap > Math.max(1000, Math.floor(budget * 0.35)) ? 'budget' : 'self';
  const selected = new Set(lines.map(row => row.id));
  const context = { ...facts, chosen: [...selected] };
  const toggles = access ? [...offered].filter(id => (id !== 'P24' || type === 'factory') && skuEligible(id, context))
    .map(id => ({ ...lineFor(id, profile, id), selected: selected.has(id) })) : [];
  const rejected = Object.keys(catalogue).filter(id => !selected.has(id)).map(id => {
    if (!exclusions.has(id)) explain(id, eligibilityIssue(id, context) || (requested.has(id) ? 'ALTERNATIVE' : 'NOT_REQUESTED'));
    return { ...exclusions.get(id), requested: requested.has(id) || wants.has(id) };
  });
  return {
    route, area, lines, monthly, setup, toggles, exclusions: rejected, budgetGap, version: catalogueVersion,
    options: Object.fromEntries([...offered].filter(id => typeof option(id) === 'boolean').map(id => [id, option(id)])),
    gstRequired: lines.some(row => row.gstRequired),
    installDays: lines.length ? Math.max(...lines.map(row => row.installDays)) : null
  };
}
