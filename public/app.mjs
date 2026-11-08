import { sampleImage, scanImage } from './ocr.mjs';

const main = document.querySelector('main');
const dialog = document.querySelector('dialog');
const live = document.getElementById('live');
const $ = (selector, from = document) => from.querySelector(selector);
const escape = (value) => String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]);
const money = (number) => '₹' + new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(number);
const stored = (key) => { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } };
const save = (key, value) => { try { value === null ? localStorage.removeItem(key) : localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browser */ } };
const keys = { session: 'udyam-session-2', language: 'udyam-language', cases: 'udyam-cases-2' };
const kinds = ['gst', 'udyam', 'id', 'address'];
let config;
let state = null;
let session = stored(keys.session);
let language = stored(keys.language) === 'hi' ? 'hi' : 'en';
let tab = location.hash === '#ops' ? 'ops' : 'owner';
let busy = false;
let uploads = {};
let note = '';
let progress = '';
let explanation = null;
let tabFromUrl;
let toastTimer;
const T = (en, hi) => language === 'hi' ? (hi || en) : en;
const tr = (pair) => T(...pair);

const glyphs = {
  chat: '<path d="M5 18.2 3 21l5.3-1.7a9 9 0 1 0-3.3-1.1Z"/><path d="M8 12h.01m4 0h.01m4 0h.01"/>',
  quote: '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M8.5 8h7m-7 4h7m-7 4H13"/>',
  shield: '<path d="M12 22s7-3 7-9V6l-7-3-7 3v7c0 6 7 9 7 9Z"/><path d="m9 12 2 2 4-4"/>',
  route: '<circle cx="6" cy="18" r="2.3"/><circle cx="18" cy="6" r="2.3"/><path d="M8.5 18H16a3 3 0 0 0 0-6H8a3 3 0 0 1 0-6h7.5"/>',
  clinic: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8m-4-4h8"/>',
  shop: '<path d="M4 10h16l-2-5H6l-2 5Zm1 0v9h14v-9M9 19v-5h6v5"/>',
  users: '<circle cx="9" cy="8" r="3"/><path d="M3 19v-2a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v2m2-13a3 3 0 0 1 0 6m4 7v-2a4 4 0 0 0-3-3.9"/>',
  arrow: '<path d="M4 12h15m-6-6 6 6-6 6"/>',
  chevron: '<path d="m9 6 6 6-6 6"/>',
  check: '<path d="m5 12 4 4L19 6"/>',
  clock: '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>',
  pin: '<path d="M19 10c0 5-7 10-7 10S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 1 1 8 0v3m-4 4v3"/>',
  link: '<path d="M10 14 14 10m-7 6-1 1a3 3 0 0 1-4-4l5-5a3 3 0 0 1 4 0m2 8a3 3 0 0 0 4 0l5-5a3 3 0 0 0-4-4l-1 1"/>',
  cross: '<path d="m6 6 12 12M18 6 6 18"/>',
  warning: '<path d="M10 5 3 17a1 1 0 0 0 1 2h16a1 1 0 0 0 1-2L14 5a2 2 0 0 0-4 0Z"/><path d="M12 9v4m0 3h.01"/>',
  calendar: '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M8 3v4m8-4v4m-7 7h2m2 0h2"/>',
  spark: '<path d="m12 3 2.2 6.8L21 12l-6.8 2.2L12 21l-2.2-6.8L3 12l6.8-2.2L12 3Z"/>'
};
const icon = (name, extra = '') => '<svg class="icon ' + extra + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (glyphs[name] || glyphs.route) + '</svg>';
const tile = (name, color = '') => '<span class="icon-tile ' + color + '">' + icon(name) + '</span>';
const badge = (label, color = '') => '<span class="badge ' + color + '">' + escape(label) + '</span>';
const b = (label, act, options = {}) => '<button type="button" class="button ' +
  (options.primary ? 'button-primary ' : '') + (options.small ? 'button-small ' : '') + (options.class || '') +
  '" data-act="' + act + '"' + (options.data ? ' ' + options.data : '') + (options.disabled ? ' disabled' : '') + '>' +
  escape(label) + (options.icon ? icon(options.icon) : '') + '</button>';

const typeNames = {
  clinic: ['Clinic / diagnostic centre', 'क्लिनिक / जाँच केंद्र'],
  office: ['CA / professional office', 'सीए / पेशेवर कार्यालय'],
  retail: ['Retail shop', 'रिटेल दुकान'],
  restaurant: ['Restaurant / cafe', 'रेस्टोरेंट / कैफ़े'],
  warehouse: ['Warehouse', 'गोदाम'],
  factory: ['Manufacturer', 'निर्माता'],
  multisite: ['Multi-site business', 'कई स्थानों वाला कारोबार'],
  salon: ['Salon', 'सैलून'], pharmacy: ['Pharmacy', 'फ़ार्मेसी'],
  coaching: ['Coaching centre', 'कोचिंग केंद्र'], hotel: ['Hotel', 'होटल'], logistics: ['Logistics', 'लॉजिस्टिक्स']
};
const toolNames = {
  hotspot: ['Phone hotspot', 'फ़ोन हॉटस्पॉट'], broadband: ['Broadband', 'ब्रॉडबैंड'],
  pos: ['POS / billing', 'POS / बिलिंग'], email: ['Business email', 'बिज़नेस ईमेल'],
  outages: ['Outage backup', 'इंटरनेट बैकअप'], cctv: ['CCTV', 'सीसीटीवी'],
  'guest-wifi': ['Guest Wi-Fi', 'गेस्ट वाई-फ़ाई'], 'static-ip': ['Static IP', 'स्टैटिक IP'],
  firewall: ['Managed firewall', 'फ़ायरवॉल'], sdwan: ['SD-WAN', 'SD-WAN'],
  calls: ['Calls / IVR', 'कॉल / IVR'], whatsapp: ['WhatsApp Business', 'WhatsApp बिज़नेस'],
  sms: ['SMS alerts', 'SMS अलर्ट'], 'toll-free': ['Toll-free', 'टोल-फ़्री'],
  iot: ['Machine monitoring', 'मशीन मॉनिटरिंग'], fleet: ['Fleet tracking', 'वाहन ट्रैकिंग'],
  website: ['Website / domain', 'वेबसाइट / डोमेन'], 'cloud-backup': ['Cloud backup', 'क्लाउड बैकअप'],
  security: ['Device security', 'डिवाइस सुरक्षा'], 'business-sim': ['Business SIM', 'बिज़नेस SIM'],
  'mobile-plus': ['Premium SIM / roaming', 'प्रीमियम SIM / रोमिंग'],
  'leased-line': ['Leased line', 'लीज़्ड लाइन'], gigabit: ['Gigabit fibre', 'गीगाबिट फ़ाइबर'],
  none: ['No extras', 'अतिरिक्त सेवा नहीं']
};
const questions = {
  type: ['What kind of business do you run?', 'आपका कारोबार किस तरह का है?'],
  location: ['How many sites do you need connected? Enter a PIN or a city.', 'कितने स्थानों पर कनेक्शन चाहिए? PIN या शहर दर्ज करें।'],
  staff: ['How many people will use the connection or business tools?', 'कितने लोग कनेक्शन या बिज़नेस टूल इस्तेमाल करेंगे?'],
  tools: ['What do you use now, and what services do you need?', 'अभी क्या इस्तेमाल करते हैं और कौन-सी सेवाएँ चाहिए?'],
  budget: ['What is your monthly budget before tax?', 'टैक्स से पहले आपका मासिक बजट कितना है?'],
  gst: ['Do you have a GSTIN? You can skip this to see plans available without one.', 'क्या आपके पास GSTIN है? बिना GSTIN वाले प्लान देखने के लिए छोड़ें।']
};
const eventNames = {
  CASE_STARTED: ['Case started', 'केस शुरू हुआ'], PARTNER_ATTACHED: ['Partner referral attached', 'पार्टनर रेफ़रल जोड़ा गया'],
  QUOTE_READY: ['Quote calculated', 'कोटेशन तैयार'], QUOTE_REPRICED: ['Quote repriced', 'कोटेशन अपडेट हुआ'],
  QUOTE_ACCEPTED: ['Quote accepted', 'कोटेशन स्वीकार'], CONSENT_RECORDED: ['Consent recorded', 'सहमति दर्ज हुई'],
  CONSENT_WITHDRAWN: ['Consent withdrawn', 'सहमति वापस ली गई'], KYC_CLEARED: ['KYC cleared', 'KYC पूरी हुई'],
  KYC_REVIEW_HOLD: ['KYC held for review', 'KYC समीक्षा के लिए रोकी गई'],
  KYC_CORRECTION_NEEDED: ['Proof correction requested', 'प्रमाण में सुधार चाहिए'], REVIEW_RETURNED: ['Reviewer requested replacement proof', 'समीक्षक ने नया प्रमाण माँगा'],
  REPLACEMENT_PROOF_REQUESTED: ['Replacement proof requested', 'नया प्रमाण माँगा गया'],
  ASSISTANCE_QUEUED: ['Assistance requested', 'सहायता माँगी गई'], ASSISTANCE_ASSIGNED: ['Case assigned', 'केस सौंपा गया'],
  SLOT_HELD: ['Installation window held', 'इंस्टॉलेशन समय सुरक्षित'], PAYMENT_RETRYABLE: ['Payment retry available', 'पेमेंट दोबारा किया जा सकता है'],
  ORDER_CREATED: ['Order confirmed', 'ऑर्डर पक्का हुआ'], INSTALL_STARTED: ['Installation started', 'इंस्टॉलेशन शुरू'],
  CONNECTIVITY_LIVE: ['Connectivity live', 'कनेक्शन चालू'], ALL_ACTIVE: ['All products active', 'सभी सेवाएँ चालू'],
  PARTNER_CREDITED: ['Partner credit recorded', 'पार्टनर क्रेडिट दर्ज'], RESUME_ISSUED: ['One-time resume code issued', 'एक बार का कोड जारी'],
  CASE_RESUMED: ['Case resumed on web', 'केस वेब पर फिर खुला']
};
const docNames = {
  gst: ['GST certificate', 'GST प्रमाणपत्र'], udyam: ['Udyam certificate', 'उद्यम प्रमाणपत्र'],
  id: ['Signatory ID', 'हस्ताक्षरकर्ता पहचान'], address: ['Address proof', 'पते का प्रमाण']
};
const reasons = {
  PROOF_MISSING: ['Required proof is missing', 'ज़रूरी प्रमाण नहीं मिला'],
  OCR_BLUR: ['Image is blurry. Retake or upload a sharper photo.', 'इमेज धुंधली है। नई साफ़ फ़ोटो अपलोड करें।'],
  OCR_LOW_CONFIDENCE: ['Image text needs human confirmation', 'इमेज के टेक्स्ट की मानवीय जाँच चाहिए'],
  GST_FORMAT: ['GSTIN is unreadable or its checksum failed', 'GSTIN पढ़ा नहीं गया या जाँच असफल हुई'],
  GST_CANCELLED: ['Mock GST registry status is Cancelled', 'मॉक GST रजिस्ट्री में स्थिति रद्द है'],
  GST_CANCELLED_CANDIDATE: ['One OCR character differs from the cancelled registry record. Reviewer must confirm.', 'OCR का एक अक्षर रद्द रजिस्ट्री रिकॉर्ड से अलग है। समीक्षक पुष्टि करेगा।'],
  GST_SUSPENDED: ['Mock GST registry status is Suspended', 'मॉक GST रजिस्ट्री में स्थिति निलंबित है'],
  GSTIN_NEAR_MATCH: ['GSTIN checksum failed and a nearby mock registry record exists. Recheck the certificate.', 'GSTIN जाँच असफल रही। प्रमाणपत्र दोबारा जाँचें।'],
  GST_REGISTRY_MISMATCH: ['The certificate GSTIN differs from the matching business record.', 'प्रमाणपत्र का GSTIN कारोबार के रिकॉर्ड से अलग है।'],
  GST_STATE_MISMATCH: ['GSTIN state code conflicts with the address state. Manual check required.', 'GSTIN का राज्य कोड पते से अलग है। मानवीय जाँच चाहिए।'],
  GST_LEGAL_TRADE_MISMATCH: ['Legal and trade names do not match their respective registry fields.', 'कानूनी और व्यापार नाम रजिस्ट्री से मेल नहीं खाते।'],
  GST_QUOTE_MISMATCH: ['Use the same active registration that qualified the quote.', 'कोटेशन के लिए इस्तेमाल किया गया सक्रिय पंजीकरण दें।'],
  SIGNATORY_EXPIRED: ['Signatory proof has expired.', 'हस्ताक्षरकर्ता प्रमाण की अवधि समाप्त हो गई है।'],
  GST_DETAILS: ['GST name, address or applicant does not match', 'GST का नाम, पता या आवेदक मेल नहीं खाता'],
  REGISTRY_UNAVAILABLE: ['No usable mock registry result. Manual check required.', 'मॉक रजिस्ट्री परिणाम उपलब्ध नहीं। मानवीय जाँच चाहिए।'],
  GST_ACTIVE: ['Active and applicant details match', 'सक्रिय है और विवरण मेल खाते हैं'],
  UDYAM_FORMAT: ['Udyam number is missing or unreadable', 'उद्यम नंबर नहीं मिला या पढ़ा नहीं गया'],
  UDYAM_DETAILS: ['Udyam record differs from the applicant or GST state', 'उद्यम रिकॉर्ड आवेदक या GST राज्य से मेल नहीं खाता'],
  UDYAM_ACTIVE: ['Udyam record matches', 'उद्यम रिकॉर्ड मेल खाता है'],
  SIGNATORY_MISMATCH: ['Signatory name, ID or business needs correction', 'हस्ताक्षरकर्ता का नाम, ID या कारोबार ठीक करें'],
  SIGNATORY_MATCH: ['Signatory and business match', 'हस्ताक्षरकर्ता और कारोबार मेल खाते हैं'],
  ADDRESS_STALE: ['Bill date is unreadable or outside the 90-day case window', 'बिल की तारीख पढ़ी नहीं गई या 90 दिन से पुरानी है'],
  LEGAL_NAME_MISMATCH: ['Name on the bill does not match', 'बिल का नाम मेल नहीं खाता'],
  ADDRESS_MISMATCH: ['Bill address differs from the registry', 'बिल का पता रजिस्ट्री से मेल नहीं खाता'],
  ADDRESS_VALID: ['Address matches and proof is current', 'पता मेल खाता है और प्रमाण नया है'],
  NOT_REQUIRED: ['Not required for this specimen', 'इस नमूने के लिए ज़रूरी नहीं']
};
const errors = {
  INVALID_LOCATION: ['Enter a six-digit PIN or a recognised city and the site count.', 'छह अंकों का PIN या शहर और स्थानों की संख्या दर्ज करें।'],
  INTAKE_NOT_UNDERSTOOD: ['Add a business type, city, number of sites, team size, needs or budget.', 'कारोबार का प्रकार, शहर, स्थान, टीम, ज़रूरत या बजट जोड़ें।'],
  INVALID_TOOLS: ['Choose at least one tool, or choose “None yet” by itself.', 'कम से कम एक टूल चुनें या सिर्फ़ “अभी कोई नहीं” चुनें।'],
  QUOTE_CHANGED: ['The quote changed. Refresh it before continuing.', 'कोटेशन बदल गया। आगे बढ़ने से पहले रीफ़्रेश करें।'],
  HOLD_EXPIRED: ['The slot hold expired. Select an installation window again.', 'समय की बुकिंग समाप्त हुई। फिर से समय चुनें।'],
  BAD_CODE: ['The case reference or code does not match.', 'केस नंबर या कोड मेल नहीं खाता।'],
  CODE_EXPIRED: ['This code is expired or already used. Create a new code on the original device.', 'कोड समाप्त हो गया या इस्तेमाल हो चुका है। मूल डिवाइस पर नया कोड बनाएँ।'],
  AUTH_REQUIRED: ['This browser needs a new resume code for this case.', 'इस ब्राउज़र को इस केस का नया कोड चाहिए।'],
  CASE_EXPIRED: ['This demo case has expired. Start a fresh run.', 'यह डेमो केस समाप्त हो गया। नया केस शुरू करें।'],
  CASE_UPDATED: ['Another tab changed the case. Refresh to see the latest state.', 'दूसरे टैब में केस बदला। नवीनतम स्थिति देखने के लिए रीफ़्रेश करें।'],
  KYC_GATE: ['Verification must clear before checkout.', 'पेमेंट से पहले सत्यापन पूरा होना चाहिए।'],
  REVIEW_IN_PROGRESS: ['The verification desk must return this case before it can be rescanned.', 'दोबारा स्कैन करने से पहले सत्यापन टीम केस लौटाएगी।'],
  IMAGE_FORMAT: ['Use a PNG, JPEG or WebP specimen under 8 MB.', '8 MB से कम PNG, JPEG या WebP नमूना चुनें।'],
  SERVICE_ERROR: ['The case service is temporarily unavailable. Please try again.', 'केस सेवा अभी उपलब्ध नहीं है। फिर कोशिश करें।']
};
const stageNames = {
  advisor: ['Advisor', 'सलाहकार'], quote: ['Quote', 'कोटेशन'], kyc: ['Smart KYC', 'स्मार्ट KYC'],
  checkout: ['Checkout', 'चेकआउट'], tracker: ['Tracker', 'ट्रैकर'], assisted: ['Assisted case', 'सहायता वाला केस'],
  closed: ['Closed', 'बंद']
};

function ping(text) {
  clearTimeout(toastTimer);
  live.textContent = text;
  live.classList.add('show');
  toastTimer = setTimeout(() => live.classList.remove('show'), 4000);
}

async function api(path, body, credential = session) {
  const headers = { Accept: 'application/json' };
  if (credential?.token) headers.Authorization = 'Bearer ' + credential.token;
  if (body) headers['Content-Type'] = 'application/json';
  const res = await fetch('/api' + path, { headers, ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}) });
  const payload = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(payload.error || 'SERVICE_ERROR');
  return payload;
}
const endpoint = () => '/cases/' + state.id;

function useResult(result) {
  state = result.state;
  if (result.token) {
    session = { id: state.id, token: result.token };
    save(keys.session, session);
  }
  const known = stored(keys.cases) || [];
  const history = known.filter(entry => entry.id !== state.id);
  history.unshift({ ...session, phase: state.phase, assist: state.assist, priority: state.priority?.score ?? null,
    scored: typeof state.priority?.score === 'number', updatedAt: Date.now() });
  save(keys.cases, history.slice(0, 12));
}
function changeCase(result) {
  useResult(result);
  uploads = {};
  explanation = null;
  note = '';
  progress = '';
}

function eventName(key) { return tr(eventNames[key] || [key, key]); }
function statusName(key) {
  return tr(({ review: ['On hold', 'रुका हुआ'], correction: ['Correction needed', 'सुधार चाहिए'], cleared: ['Cleared', 'पूरा'], pass: ['Pass', 'सही'] })[key] || [key, key]);
}
function coverName(key) {
  return tr(({ fibre: ['Fibre available', 'फ़ाइबर उपलब्ध'], wireless: ['5G fixed wireless available', '5G वायरलेस उपलब्ध'],
    none: ['Field survey needed', 'साइट सर्वे चाहिए'], provisional: ['Fibre likely · confirm at install', 'फ़ाइबर संभावित · इंस्टॉलेशन पर पुष्टि'], unknown: ['PIN needs a coverage check', 'PIN की कवरेज जाँच चाहिए'] })[key] || ['', '']);
}

function head(label, subtitle, name, right = '', color = '') {
  return '<div class="card-head"><div class="headline">' + tile(name, color) + '<div><h2>' + label +
    '</h2><p>' + subtitle + '</p></div></div>' + right + '</div>';
}

function ownerHeader() {
  return '<header class="owner-header"><div class="eyebrow"><span class="eyeline"></span>' +
    T('Accel Business', 'Accel Business') + '</div><h1>' +
    T('Set up your business services', 'अपने बिज़नेस की सेवाएँ शुरू करें') + '</h1><p>' +
    T('Choose a bundle, verify your business and book installation in the same case.',
      'प्लान चुनें, कारोबार का सत्यापन करें और उसी केस में इंस्टॉलेशन बुक करें।') + '</p></header>';
}

function rail() {
  const rows = [
    ['advisor', 'chat', ['Find a fit', 'सही प्लान चुनें']], ['quote', 'quote', ['See the price', 'कीमत देखें']],
    ['kyc', 'shield', ['Verify and book', 'सत्यापन और बुकिंग']], ['tracker', 'route', ['Follow activation', 'एक्टिवेशन देखें']]
  ];
  const active = state?.phase === 'checkout' ? 2 : state?.phase === 'assisted' ? 1 :
    Math.max(0, rows.findIndex(([key]) => key === (state?.phase || 'advisor')));
  return '<ol class="rail" aria-label="' + T('Order progress', 'ऑर्डर की प्रगति') + '">' + rows.map(([key, name, sub], index) =>
    '<li class="' + (index < active ? 'done' : index === active ? 'current' : '') + '"' + (index === active ? ' aria-current="step"' : '') +
    '><span class="rail-icon">' + icon(index < active ? 'check' : name) + '</span><div class="rail-text"><strong>' +
    tr(stageNames[key]) + '</strong><small>' + tr(sub) + '</small></div></li>'
  ).join('') + '</ol>';
}

const starters = [
  ['clinic', 'clinic', ['Clinic with fibre', 'फ़ाइबर वाला क्लिनिक'], ['Single site · three people', 'एक स्थान · तीन लोग'], 'green'],
  ['cancelled', 'shield', ['K01 · cancelled GSTIN', 'K01 · रद्द GSTIN'], ['Verification review sample', 'सत्यापन समीक्षा का नमूना'], 'amber'],
  ['shop', 'shop', ['Shop · fibre unavailable', 'दुकान · फ़ाइबर उपलब्ध नहीं'], ['Fixed wireless coverage', 'वायरलेस कवरेज'], 'cool'],
  ['multisite', 'users', ['Multi-site · per-site quote', 'मल्टी-साइट · प्रति स्थान कोटेशन'], ['Three sites · one bundle', 'तीन स्थान · एक बंडल'], '']
];

function scenarioButton([id, glyph, label, description, color]) {
  return '<button type="button" class="scenario" data-act="scenario" data-scenario="' + id + '">' + tile(glyph, color) +
    '<span><strong>' + tr(label) + '</strong><small>' + tr(description) + '</small></span><span class="end">' + icon('chevron') + '</span></button>';
}

function sidebar() {
  const fixtures = config.fixtures.filter(row => row.id !== 'K01');
  const fixturePicker = fixtures.length ? '<form class="fixture-picker" data-form="fixture"><label class="field">' +
    T('Verification specimen', 'सत्यापन का नमूना') + '<select name="fixture">' +
    fixtures.map(row => '<option value="' + escape(row.id) + '">' + escape(row.id + ' · ' + row.description) + '</option>').join('') +
    '</select></label><button type="submit" class="button button-small">' + T('Open specimen case', 'नमूना केस खोलें') +
    '</button></form>' : '';
  const intro = '<details class="card sample-profiles"><summary>' + T('Sample profiles', 'नमूना प्रोफ़ाइल') +
    '</summary><div class="quick-cards">' + starters.map(scenarioButton).join('') + '</div>' + fixturePicker + '</details>';
  const pass = '<section class="card panel passport"><div class="spread"><h3>' + T('Case passport', 'केस पासपोर्ट') + '</h3>' +
    icon('route') + '</div>' + (state ? '<div class="passport-code">' + state.id + '</div><div class="tag-row">' +
      badge(state.channel === 'web' ? T('Web', 'वेब') : T('WhatsApp simulator', 'WhatsApp सिम्युलेटर'), 'cool') +
      (state.partner ? badge(T('Partner ', 'पार्टनर ') + state.partner) : '') + '</div><div class="mini-events">' +
      state.events.slice(-3).reverse().map(row => '<span>' + eventName(row.event) + '</span>').join('') + '</div><div class="actions">' +
      b(T('Get resume code', 'फिर खोलने का कोड'), 'issue', { small: true, icon: 'link', disabled: state.phase === 'closed' }) +
      b(T('Get help', 'सहायता लें'), 'assist', { small: true, disabled: Boolean(state.assist) || state.phase === 'closed' }) +
      b(T('New assessment', 'नया आकलन'), 'start', { small: true }) + '</div>' :
      '<p class="section-sub">' + T('Your quote, consent, referral and install window follow this reference.', 'कोटेशन, सहमति, रेफ़रल और इंस्टॉलेशन इस केस से जुड़े रहते हैं।') + '</p><div class="actions">' +
      b(T('Resume a case', 'केस फिर खोलें'), 'openResume', { small: true, icon: 'link' }) + '</div>') + '</section>';
  return '<aside class="stack">' + pass + intro + '</aside>';
}

function bubble(content, owner = false) {
  return '<div class="bubble' + (owner ? ' owner' : '') + '">' + (!owner ? '<strong>' + T('Udyam advisor', 'उद्यम सलाहकार') + '</strong>' : '') +
    '<p>' + escape(content) + '</p></div>';
}

function advisor() {
  const chatTitle = state?.channel === 'web' ? T('Web advisor', 'वेब सलाहकार') : T('WhatsApp advisor', 'WhatsApp सलाहकार');
  let messages = bubble(T('Tell me about your business in a message, or answer the questions below.',
    'अपने कारोबार के बारे में लिखें या नीचे दिए सवालों के जवाब दें।'));
  const submit = (label) => '<button type="submit" class="button button-primary">' + escape(label) + icon('arrow') + '</button>';
  const chat = '<form data-form="intake" class="chat-compose"><label class="field">' +
    T('Describe your business and needs', 'अपने कारोबार और ज़रूरतों के बारे में लिखें') +
    '<textarea name="text" rows="2" maxlength="1200" required placeholder="' + escape(T(
      'Two shops in Jaipur, six staff, need CCTV. Budget ₹6,000.',
      'मेरी जयपुर में दो दुकानें हैं, 6 लोग हैं, CCTV चाहिए। बजट ₹6,000।')) + '"></textarea></label>' +
    submit(T('Send message', 'संदेश भेजें')) + '</form>';
  let controls;
  if (!state) {
    controls = '<div class="actions">' + b(T('Start the chat', 'चैट शुरू करें'), 'start', { primary: true, icon: 'arrow' }) +
      b(T('Continue on web', 'वेब पर शुरू करें'), 'startWeb') + '</div><p class="chat-note">' +
      T('Use English or Hindi. Enter synthetic case data only.', 'अंग्रेज़ी या हिंदी का इस्तेमाल करें। सिर्फ़ नमूना डेटा दर्ज करें।') + '</p>';
  } else {
    const p = { ...state.previousProfile, ...state.profile };
    const current = state.nextQuestion;
    const answers = {
      type: state.profile.type && tr(typeNames[state.profile.type]),
      location: state.profile.sites && [state.profile.city, state.profile.pin,
        state.profile.sites + T(' site(s)', ' स्थान')].filter(Boolean).join(' · '),
      staff: state.profile.staff && state.profile.staff + T(' people', ' लोग'),
      tools: state.profile.tools && (state.profile.tools.map(tool => tr(toolNames[tool] || [tool, tool])).join(', ') || tr(toolNames.none)),
      budget: state.profile.budget && money(state.profile.budget)
    };
    for (const [key, value] of Object.entries(answers)) {
      if (value && key !== current) messages += bubble(value, true);
    }
    if (current) messages += bubble(tr(questions[current]));
    const next = submit(T('Continue', 'आगे बढ़ें'));
    switch (current) {
      case 'type':
        controls = '<div class="actions">' + Object.entries(typeNames).map(([key, value]) =>
          b(tr(value), 'type', { small: true, data: 'data-value="' + key + '"' })).join('') + '</div>';
        break;
      case 'location':
        controls = '<form data-form="location" class="form-row location-form"><label class="field">' + T('Installation PIN', 'इंस्टॉलेशन PIN') +
          '<input name="pin" placeholder="302017" value="' + escape(p.pin || '') + '" inputmode="numeric" pattern="[1-9][0-9]{5}" maxlength="6"></label><label class="field">' +
          T('City', 'शहर') + '<input name="city" placeholder="Jaipur" maxlength="50" value="' + escape(p.city || '') + '"></label><label class="field">' +
          T('Number of sites', 'स्थान की संख्या') + '<input name="sites" type="number" min="1" max="100" required value="' + (p.sites || 1) + '"></label>' +
          next + '</form>';
        break;
      case 'staff':
        controls = '<form data-form="staff" class="form-row single"><label class="field">' + T('Number of people', 'लोगों की संख्या') +
          '<input name="value" type="number" min="1" max="500" required placeholder="3" value="' + escape(p.staff || '') + '"></label>' + next + '</form>';
        break;
      case 'tools':
        controls = '<form data-form="tools"><div class="choices">' + Object.entries(toolNames).filter(([key]) => key !== 'none').map(([key, value]) =>
          '<label class="choice"><input type="checkbox" name="tool" value="' + key + '"' + (p.tools?.includes(key) ? ' checked' : '') + '> ' + tr(value) + '</label>'
        ).join('') + '</div>' + next + '</form>';
        break;
      case 'budget':
        controls = '<form data-form="budget" class="form-row single"><label class="field">' + T('Monthly budget (₹)', 'मासिक बजट (₹)') +
          '<input name="value" type="number" min="300" max="500000" required placeholder="3000" value="' + escape(p.budget || '') + '"></label>' + next + '</form>';
        break;
      case 'gst':
        controls = '<form data-form="gst" class="form-row single"><label class="field">' + T('GSTIN (optional)', 'GSTIN (वैकल्पिक)') +
          '<input name="value" maxlength="15" autocomplete="off" autocapitalize="characters" placeholder="' +
          escape(T('Leave blank to skip', 'छोड़ने के लिए खाली रखें')) + '"></label>' + next + '</form>';
        break;
    }
    if (state.draftQuote?.lines.length) messages += bubble(T('Estimate so far ', 'अभी का अनुमान ') +
      state.draftQuote.lines.map(line => lineName(line)).join(', ') + ' · ' + money(state.draftQuote.monthly) +
      T(' per month. Finish the questions to confirm.', ' प्रति माह। पुष्टि के लिए सवाल पूरे करें।'));
  }
  return '<section class="card chat-card" aria-labelledby="chat-title"><div class="chat-head"><div class="headline">' +
    tile('chat', 'green') + '<div><strong id="chat-title">' + chatTitle + '</strong><p>' + T('Business needs assessment', 'ज़रूरतों का आकलन') +
    '</p></div></div>' + badge(state?.intakeMode === 'genai' ? 'GenAI' : T('English / Hindi', 'हिंदी / अंग्रेज़ी'), 'green') +
    '</div><div class="chat-body" id="messages" aria-live="polite">' + messages + '</div><div class="chat-actions">' + chat +
    '<div class="guided-form">' + (controls || '') + '</div></div></section>';
}

function lineName(line) { return T(line.name, line.hi); }

function quoteExclusions(q) {
  const rows = q.exclusions || [];
  const decisions = rows.filter(row => row.requested || row.code === 'ACCESS_STEP_DOWN' || row.code === 'OWNER_CHOICE');
  const markup = rows => rows.map(row => '<li><strong>' + escape(lineName(row)) + '</strong> · ' +
    escape(T(row.reason, row.hiReason)) + (row.alternative === 'P18' ? ' ' + T('Try Website + Domain.', 'वेबसाइट और डोमेन आज़माएँ।') : '') +
    '</li>').join('');
  return '<div class="exclusions"><h3>' + T('Why products were left out', 'सेवाएँ क्यों शामिल नहीं हुईं') + '</h3>' +
    (decisions.length ? '<ul>' + markup(decisions) + '</ul>' : '') + '<details><summary>' +
    T('All other catalogue options', 'बाकी कैटलॉग विकल्प') + '</summary><ul>' + markup(rows.filter(row => !decisions.includes(row))) + '</ul></details></div>';
}

function showQuote() {
  const q = state.quote;
  const geo = [q.area.city && T(q.area.city, q.area.hi), state.profile.pin,
    q.area.tier && T('Tier ', 'श्रेणी ') + q.area.tier, coverName(q.area.code)].filter(Boolean).join(' · ');
  const header = head(T('Your business quote', 'आपका बिज़नेस कोटेशन'), escape(geo), 'quote',
    badge('V' + state.quoteRevision + ' · ' + q.version, 'cool'));
  if (!q.lines.length) return '<section class="card panel">' + header + '<div class="notice amber">' +
    T('A site survey is needed to confirm an access option.', 'इंटरनेट विकल्प की पुष्टि के लिए साइट सर्वे चाहिए।') + '</div>' + quoteExclusions(q) + '<div class="actions">' +
    b(T('Request a site survey', 'साइट सर्वे माँगें'), 'assist', { primary: true, icon: 'arrow' }) +
    b(T('Edit business needs', 'ज़रूरतें बदलें'), 'edit') + '</div></section>';

  const summary = '<div class="summary-band"><div><div class="money">' + money(q.monthly) + ' <small>' +
    T('/ month', '/ महीना') + '</small></div><p>' + T('Catalogue floor prices before tax', 'टैक्स से पहले कैटलॉग की न्यूनतम कीमत') +
    '</p></div><div><strong>' + money(q.setup) + '</strong><p>' + T('One-time setup', 'एक बार का सेटअप') + '</p></div></div>';
  const explanationText = explanation?.text || q.lines.map(line => T(line.detail, line.hiDetail)).join(' ');
  const fit = '<div class="notice"><div class="spread"><strong>' + T('Why this fits', 'यह प्लान क्यों सही है') + '</strong>' +
    badge(explanation?.mode === 'genai' ? 'GenAI · hosted' : explanation?.mode === 'device' ? 'GenAI · on device' :
      T('Catalogue rules', 'कैटलॉग नियम'), 'cool') + '</div><p>' + escape(explanationText) + '</p>' +
    (config.hostedAi || globalThis.LanguageModel ? '<div class="actions">' +
      b(T('Generate an AI explanation', 'AI से व्याख्या बनाएँ'), 'explain', { small: true, icon: 'spark' }) + '</div>' : '') + '</div>';
  const registration = state.profile.gstStatus;
  const tax = registration && registration !== 'none' ? '<div class="notice ' + (state.profile.gstVerified ? 'green' : 'amber') + '">' +
    (state.profile.gstVerified ? T('Active GSTIN checked in the mock registry.', 'मॉक रजिस्ट्री में सक्रिय GSTIN मिला।') :
      T('GSTIN is not active in the mock registry. GSTIN-gated items are excluded.', 'मॉक रजिस्ट्री में सक्रिय GSTIN नहीं मिला। GSTIN वाली सेवाएँ शामिल नहीं हैं।')) +
    ' ' + escape(state.profile.gstReference || '') + '</div>' : '';
  const budget = q.budgetGap ? '<div class="notice amber">' + T('This quote is ', 'यह कोटेशन ') + money(q.budgetGap) +
    T(' above your monthly budget.', ' आपके मासिक बजट से ज़्यादा है।') + '</div>' : '';
  const lines = '<div class="lines">' + q.lines.map(line => '<div class="line-row"><div><strong>' + escape(lineName(line)) +
    (line.qty > 1 ? ' × ' + line.qty : '') + '</strong><small>' + escape(T(line.detail, line.hiDetail)) +
    '</small></div><div class="line-value"><strong>' + money(line.monthly) + '</strong><small>' +
    line.term + T(' mo minimum', ' महीने न्यूनतम') + (line.oneTime ? ' · ' + money(line.oneTime) + T(' setup', ' सेटअप') : '') + '</small></div></div>').join('') + '</div>';
  const extras = (q.toggles || []).map(item => {
    const impact = item.selected ? T('Turn off to save ', 'बंद करके बचाएँ ') : '+';
    const label = lineName(item);
    return '<label class="addon"><span>' + escape(label) + '<small>' +
      escape(impact + money(item.monthly) + T(' / month', ' / महीना') + (item.oneTime ? ' · ' + money(item.oneTime) + T(' setup', ' सेटअप') : '')) +
      '</small></span><input type="checkbox" role="switch" data-toggle="' + item.id + '" ' + (item.selected ? 'checked ' : '') +
      'aria-label="' + escape(label) + '"></label>';
  }).join('');
  return '<section class="card panel">' + header + summary + tax + budget + lines + extras + quoteExclusions(q) + fit + '<div class="actions">' +
    (q.route === 'self' ? b(T('Accept quote & verify', 'कोटेशन स्वीकार कर सत्यापन करें'), 'accept', { primary: true, icon: 'arrow' }) :
      b(T('Send quote to field sales', 'कोटेशन फ़ील्ड सेल्स को भेजें'), 'assist', { primary: true, icon: 'arrow' })) +
    b(T('Edit business needs', 'ज़रूरतें बदलें'), 'edit') + '</div></section>';
}

function checkList(result) {
  return '<ul class="check-list">' + result.checks.map(row => '<li>' +
    icon(row.state === 'pass' ? 'check' : 'warning', row.state === 'pass' ? '' : 'warning') + '<span><strong>' +
    tr(docNames[row.name]) + ' · </strong>' + tr(reasons[row.reason] || [row.reason, row.reason]) +
    (row.tamper ? ' ' + T('Possible tamper signal.', 'संभावित छेड़छाड़ का संकेत।') : '') + '</span>' +
    (row.reference ? '<code>' + escape(row.reference) + '</code>' : '<span></span>') + '</li>').join('') + '</ul>';
}

function showKyc() {
  const header = head(T('Smart KYC', 'स्मार्ट KYC'), T('Consent, document reading and mock registry checks.',
    'सहमति, दस्तावेज़ पढ़ना और मॉक रजिस्ट्री जाँच।'), 'shield', state.fixture ? badge(state.fixture, 'cool') : '', 'green');
  if (!state.consent) {
    return '<section class="card panel">' + header + '<div class="notice"><strong>' +
      T('Before you add proof', 'प्रमाण जोड़ने से पहले') + '</strong><p>' +
      T('Use synthetic files for this demo. The browser reads the images locally. Only necessary fields go to the mock verifier. Saved results contain masked references.',
        'इस डेमो में सिर्फ़ नमूना फ़ाइलें इस्तेमाल करें। ब्राउज़र इमेज यहीं पढ़ता है। मॉक सत्यापन में सिर्फ़ ज़रूरी फ़ील्ड जाते हैं। सेव हुए परिणाम में पहचान छिपी है।') +
      '</p></div><p class="muted">' +
      T('Purpose: verify this sample order. Raw images stay in this tab. You can withdraw consent before payment.',
        'उद्देश्य: इस नमूना ऑर्डर का सत्यापन। मूल इमेज इसी टैब में रहती है। पेमेंट से पहले सहमति वापस ले सकते हैं।') +
      '</p><form data-form="consent"><label class="checkbox"><input type="checkbox" name="agree" required><span>' +
      T('I agree to the stated demo verification purpose.', 'मैं बताए गए डेमो सत्यापन उद्देश्य से सहमत हूँ।') + '</span></label>' +
      '<button type="submit" class="button button-primary">' + T('Agree & continue', 'सहमत हूँ, आगे बढ़ें') +
      icon('arrow') + '</button></form></section>';
  }
  const held = state.kyc?.status === 'review';
  const result = state.kyc ? '<div class="notice ' + (held ? 'amber' : 'red') + '"><strong>' +
    statusName(state.kyc.status) + '</strong><p>' + (held
      ? T('Booking and payment are locked. The verification desk can return the case for corrected proof.',
        'बुकिंग और पेमेंट बंद हैं। सत्यापन टीम सही प्रमाण के लिए केस लौटा सकती है।')
      : T('Fix the flagged evidence, then rescan this case.', 'चिह्नित प्रमाण ठीक करें और केस फिर स्कैन करें।')) + '</p></div>' +
      checkList(state.kyc) + (held ? '<div class="actions">' + b(T('Open verification desk', 'सत्यापन डेस्क खोलें'), 'ops', { primary: true, icon: 'arrow' }) + '</div>' : '') : '';
  const tiles = '<div class="evidence-grid">' + kinds.map(kind => {
    const required = state.evidencePolicy?.[kind];
    return '<div class="evidence"><div class="spread"><strong>' + tr(docNames[kind]) + '</strong>' +
      badge(uploads[kind] ? T('Selected', 'चुना गया') : required ? T('Required', 'ज़रूरी') : T('Optional', 'वैकल्पिक'),
        uploads[kind] ? 'green' : '') + '</div><input type="file" accept="image/png,image/jpeg,image/webp" data-upload="' + kind +
      '" aria-label="' + escape(T('Choose ', 'चुनें ') + tr(docNames[kind])) + '"><small>' +
      (uploads[kind] ? escape(uploads[kind].name) : T('PNG, JPEG or WebP · under 8 MB', 'PNG, JPEG या WebP · 8 MB से कम')) + '</small></div>';
  }).join('') + '</div>';
  const inputs = held ? '' : '<div class="actions">' +
    b(state.fixture?.endsWith('R') ? T('Scan replacement set', 'नया प्रमाण स्कैन करें') : T('Scan sample documents', 'नमूना दस्तावेज़ स्कैन करें'),
      'scanSample', { primary: true, icon: 'shield' }) +
    b(T('Scan my selected files', 'चुनी हुई फ़ाइलें स्कैन करें'), 'scanUploads', { disabled: !Object.keys(uploads).length }) +
    (state.fixture === 'K05' && state.kyc?.status === 'correction' ?
      b(T('Request the replacement Udyam proof', 'नया उद्यम प्रमाण माँगें'), 'replaceMissing') : '') +
    '</div>' + tiles;
  return '<section class="card panel">' + header + '<p class="muted">' +
    T('Case clock 15 July 2026 · 90-day address proof rule · Browser OCR', 'केस तारीख 15 जुलाई 2026 · 90 दिन का नियम · ब्राउज़र OCR') +
    '</p>' + result + inputs +
    (progress ? '<div class="notice" role="status">' + escape(progress) + '</div>' : '') + '<div class="actions">' +
    '<button type="button" class="button-link" data-act="withdrawAsk">' + T('Withdraw consent', 'सहमति वापस लें') +
    '</button></div></section>';
}

function showCheckout() {
  const q = state.quote;
  const hold = state.hold && !state.hold.expired ? state.hold : null;
  return '<section class="card panel">' + head(T('Book installation', 'इंस्टॉलेशन बुक करें'),
    T('Choose a demo window and complete the simulated checkout.', 'डेमो समय चुनें और नकली पेमेंट पूरा करें।'), 'calendar',
    badge(T('KYC cleared', 'KYC पूरी'), 'green'), 'green') +
    '<div class="notice green"><strong>' + T('Verification cleared.', 'सत्यापन पूरा हुआ।') + '</strong> ' +
    T('The slot is held for ten minutes per case.', 'समय दस मिनट के लिए सुरक्षित है।') + '</div>' +
    '<div class="slot-row" aria-label="' + T('Installation window', 'इंस्टॉलेशन का समय') + '">' +
    config.slots.map(slot => '<button type="button" class="slot" data-act="slot" data-slot="' + slot.id + '" aria-pressed="' +
      (hold?.slot === slot.id) + '"><strong>' + T(slot.day, slot.hi) + '</strong><small>' + T(slot.week, slot.hiWeek) +
      '</small><small>' + slot.time + '</small></button>').join('') + '</div>' +
    '<div class="summary-band"><div><div class="money">' + money(q.monthly + q.setup) + '</div><p>' +
    T('Demo amount due · first month + setup · before tax', 'डेमो राशि · पहला महीना + सेटअप · टैक्स से पहले') +
    '</p></div><div><strong>' + money(q.monthly) + '</strong><p>' + T('Monthly after setup', 'सेटअप के बाद हर महीने') + '</p></div></div>' +
    (note ? '<div class="notice amber">' + escape(note) + '</div>' : '') +
    '<div class="actions">' + b(T('Pay in sandbox', 'डेमो पेमेंट करें'), 'pay', { primary: true, icon: 'lock', disabled: !hold }) +
    b(T('Simulate failed attempt', 'असफल पेमेंट दिखाएँ'), 'fail', { disabled: !hold, small: true }) +
    '<button type="button" class="button-link" data-act="withdrawAsk">' + T('Withdraw consent', 'सहमति वापस लें') + '</button></div>' +
    '<p class="chat-note">' + T('A retry returns the same order. The sandbox never requests payment credentials.',
      'दोबारा पेमेंट में वही ऑर्डर मिलता है। डेमो में पेमेंट की जानकारी नहीं माँगी जाती।') + '</p></section>';
}

function showTracker() {
  const order = state.order;
  const slot = config.slots.find(row => row.id === order.slot);
  const labels = [
    [['Order confirmed', 'ऑर्डर पक्का'], ['Payment receipt and slot recorded', 'पेमेंट रसीद और समय दर्ज']],
    [['Installation in progress', 'इंस्टॉलेशन जारी'], ['The installation desk is handling the visit', 'इंस्टॉलेशन टीम विज़िट संभाल रही है']],
    [['Connectivity live', 'कनेक्शन चालू'], ['Other services can still be provisioning', 'बाकी सेवाएँ अभी तैयार हो सकती हैं']],
    [['All products active', 'सभी सेवाएँ चालू'], ['Partner attribution is recorded once', 'पार्टनर क्रेडिट एक बार दर्ज होता है']]
  ];
  return '<section class="card panel">' + head(T('Activation tracker', 'एक्टिवेशन ट्रैकर'),
    order.id + ' · ' + T('Installation desk', 'इंस्टॉलेशन टीम'), 'route',
    badge(order.step === 3 ? T('All active', 'सभी चालू') : T('In progress', 'जारी'), 'green'), 'green') +
    '<div class="summary-band"><div><strong>' + T('Installation window', 'इंस्टॉलेशन का समय') + '</strong><p>' +
    T(slot.day, slot.hi) + ' · ' + slot.time + '</p></div><div><strong>' + order.payment + '</strong><p>' +
    T('Sandbox receipt', 'डेमो रसीद') + ' · ' + money(order.amount) + '</p></div></div>' +
    '<ol class="timeline">' + labels.map(([title, sub], index) => '<li class="' + (index <= order.step ? 'done' : '') +
      '"><span class="status-point">' + (index <= order.step ? icon('check') : index + 1) + '</span><div><strong>' +
      tr(title) + '</strong><small>' + tr(sub) + '</small></div>' +
      (index === order.step ? badge(T('Current', 'अभी'), 'green') : '') + '</li>').join('') + '</ol>' +
    '<div class="lines">' + state.quote.lines.map(line => '<div class="line-row"><strong>' + escape(lineName(line)) +
      (line.qty > 1 ? ' × ' + line.qty : '') + '</strong><span>' + (order.step === 3 || (order.step >= 2 && line.group === 'access')
        ? badge(T('Active', 'चालू'), 'green') : badge(order.step === 0 ? T('Scheduled', 'निर्धारित') : T('Provisioning', 'तैयारी जारी'), 'cool')) +
      '</span></div>').join('') + '</div><div class="actions">' +
    b(T('Copy tracking link', 'ट्रैकिंग लिंक कॉपी करें'), 'copyLink', { icon: 'link' }) +
    b(T('Refresh status', 'स्थिति रीफ़्रेश करें'), 'refresh', { small: true }) +
    b(T('Open fulfilment desk', 'फ़ुलफ़िलमेंट डेस्क खोलें'), 'ops', { small: true }) + '</div></section>';
}

function showAssisted() {
  return '<section class="card panel">' + head(T('Your case is with field sales', 'आपका केस फ़ील्ड सेल्स के पास है'),
    state.id, 'users', badge(T('Assisted route', 'सहायता वाला रास्ता'), 'amber')) + '<div class="notice">' +
    T('The specialist has the needs, coverage result and partner code. The case stays visible here while the team prepares a site survey or a multi-site quote.',
      'विशेषज्ञ को ज़रूरतें, कवरेज और पार्टनर कोड मिल गए। साइट सर्वे या मल्टी-साइट कोटेशन तैयार होने तक केस यहाँ दिखता रहेगा।') +
    '</div><div class="actions">' + b(T('Open operations', 'ऑपरेशंस खोलें'), 'ops', { primary: true, icon: 'arrow' }) +
    b(T('Refresh status', 'स्थिति रीफ़्रेश करें'), 'refresh') + '</div></section>';
}

function showOwner() {
  const views = { quote: showQuote, kyc: showKyc, checkout: showCheckout, tracker: showTracker, assisted: showAssisted };
  const view = state?.phase === 'closed' ? '<section class="card panel">' + head(T('Case closed', 'केस बंद'),
    T('Consent was withdrawn. Start a new case to continue.', 'सहमति वापस ली गई। आगे बढ़ने के लिए नया केस शुरू करें।'), 'lock') +
    b(T('Start a new chat', 'नई चैट शुरू करें'), 'start', { primary: true }) + '</section>' : (views[state?.phase] || advisor)();
  return ownerHeader() + rail() + '<div class="workspace"><div id="work-area" class="stack">' + view + '</div>' + sidebar() + '</div>';
}

function sectionTop(eyebrow, title, subtitle, label) {
  return '<header class="section-top"><div><div class="eyebrow"><span class="eyeline"></span>' + eyebrow +
    '</div><h1>' + title + '</h1><p>' + subtitle + '</p></div>' + badge(label, 'cool') + '</header>';
}

function showOps() {
  const intro = sectionTop(T('Operations', 'ऑपरेशंस'), T('Case operations', 'केस ऑपरेशंस'),
    T('Sales, verification and installation use the owner’s case reference.', 'सेल्स, सत्यापन और इंस्टॉलेशन में मालिक का वही केस नंबर इस्तेमाल होता है।'),
    T('Simulated staff view', 'डेमो स्टाफ़ व्यू'));
  if (!state) return intro + '<section class="card panel">' + head(T('No active case', 'कोई सक्रिय केस नहीं'),
    T('Open a demo case from the owner journey first.', 'पहले मालिक के व्यू से डेमो केस खोलें।'), 'users') +
    b(T('Open owner journey', 'मालिक का व्यू खोलें'), 'owner', { primary: true }) + '</section>';
  const a = state.assist;
  const known = stored(keys.cases) || [];
  const recent = known.filter(entry => entry.assist && entry.id !== state.id)
    .sort((left, right) => right.priority - left.priority).slice(0, 5);
  const waiting = recent.length ? '<details class="queue-other"><summary>' + T('Other assisted cases', 'अन्य सहायता केस') +
    ' (' + recent.length + ')</summary><div class="actions">' + recent.map(entry => b(entry.id + ' · ' + entry.priority,
      'loadCase', { small: true, data: 'data-id="' + entry.id + '"' })).join('') + '</div></details>' : '';
  const ranked = known.filter(entry => entry.scored && ['quote', 'assisted', 'kyc', 'checkout'].includes(entry.phase) &&
    Date.now() - entry.updatedAt < 86400000).sort((left, right) => right.priority - left.priority).slice(0, 5);
  const callNext = '<section class="card panel">' + head(T('Who to call next', 'अगली कॉल किसे करें'),
    T('Open cases on this device ranked by activation propensity.', 'इस डिवाइस के खुले केस एक्टिवेशन संभावना के क्रम में।'), 'users') +
    (ranked.length ? '<ol class="exclusions">' + ranked.map(entry => '<li><strong>' + escape(entry.id) +
      '</strong> · ' + escape(entry.priority) + '% ' + (entry.id === state.id ? T('· Current case', '· वर्तमान केस') :
        b(T('Open case', 'केस खोलें'), 'loadCase', { small: true, data: 'data-id="' + entry.id + '"' })) + '</li>').join('') + '</ol>' :
      '<p class="section-sub">' + T('Finish a quote to score a case.', 'केस का स्कोर देखने के लिए कोटेशन पूरा करें।') + '</p>') + '</section>';
  const tag = a?.type === 'kyc' ? T('Verification desk', 'सत्यापन डेस्क') :
    a ? T('Field sales desk', 'फ़ील्ड सेल्स डेस्क') : T('Self-serve', 'सेल्फ़-सर्व');
  const opsAction = a ? '<div class="notice amber"><strong>' + tag + '</strong><p>' +
    (a.state === 'assigned' ? T('A specialist has picked up this case.', 'विशेषज्ञ ने केस ले लिया है।') :
      T('This case is waiting for a specialist.', 'यह केस विशेषज्ञ का इंतज़ार कर रहा है।')) + '</p></div><div class="actions">' +
    (a.state === 'queued' ? b(T('Assign to demo specialist', 'डेमो विशेषज्ञ को सौंपें'), 'claim', { primary: a.type !== 'kyc' }) : '') +
    (a.type === 'kyc' && state.kyc?.status === 'review' ? b(T('Return for corrected proof', 'सही प्रमाण के लिए लौटाएँ'), 'review', { primary: true, icon: 'arrow' }) : '') +
    '</div>' : '<p class="section-sub">' + T('This case has no open assistance request.', 'इस केस में सहायता का कोई खुला अनुरोध नहीं है।') + '</p>';
  const order = state.order;
  const fulfil = order ? '<section class="card panel">' + head(T('Fulfilment controls', 'फ़ुलफ़िलमेंट नियंत्रण'),
    order.id + ' · ' + T('Simulated product adapter', 'डेमो प्रोडक्ट अडैप्टर'), 'route',
    badge(order.step === 3 ? T('Complete', 'पूरा') : order.step + '/3', 'green')) +
    '<p class="muted">' + (order.referralCredited ? T('Activation recorded partner credit once for ', 'एक्टिवेशन ने एक बार पार्टनर क्रेडिट दर्ज किया ') + escape(state.partner) + '.' :
      T('Post the next milestone, then reopen the owner tracker. Partner credit appears at full activation.', 'अगला चरण भेजें, फिर मालिक का ट्रैकर खोलें। पूरा एक्टिवेशन होने पर पार्टनर क्रेडिट दिखेगा।')) +
    '</p><div class="actions">' + b(order.step === 0 ? T('Start installation', 'इंस्टॉलेशन शुरू करें') : order.step === 1 ?
      T('Mark connectivity live', 'कनेक्शन चालू दिखाएँ') : T('Activate remaining products', 'बाकी सेवाएँ चालू करें'),
      'advance', { primary: true, disabled: order.step === 3, icon: 'arrow' }) +
    '</div></section>' : '';
  const summary = '<div class="grid-three"><div class="card kpi"><small>' + T('Case', 'केस') + '</small><div class="passport-code">' + state.id +
    '</div><small>' + tr(stageNames[state.phase]) + '</small></div><div class="card kpi"><small>' +
    T('Activation propensity', 'एक्टिवेशन संभावना') + '</small><strong>' + (state.priority.score === null ? '—' : state.priority.score + '%') + '</strong><small>' +
    T('Model trained on synthetic case leads', 'सिंथेटिक लीड पर प्रशिक्षित मॉडल') + '</small></div><div class="card kpi"><small>' +
    T('Referral attribution', 'रेफ़रल') + '</small><strong>' + escape(state.partner || '—') + '</strong><small>' +
    (order?.referralCredited ? T('Credited once', 'एक बार क्रेडिट') : T('Credit after activation', 'एक्टिवेशन के बाद क्रेडिट')) + '</small></div></div>';
  return intro + '<div class="stack">' + summary + '<div class="grid-two"><div class="stack"><section class="card panel">' +
    head(T('Assistance queue', 'सहायता कतार'), T('Current demo case', 'वर्तमान डेमो केस'), 'users', badge(tag, a ? 'amber' : 'green')) +
    opsAction + waiting + (state.kyc ? checkList(state.kyc) : '') +
    (state.priority.reasons.length ? '<p class="section-sub">' + state.priority.reasons.map(escape).join(' · ') + '</p>' : '') +
    '<div class="actions">' + b(T('Back to owner case', 'मालिक के केस पर लौटें'), 'owner', { small: true }) +
    (state.partner ? b(T('Copy partner entry link', 'पार्टनर लिंक कॉपी करें'), 'partnerLink', { small: true, icon: 'link' }) : '') +
    '</div></section>' + callNext + fulfil +
    '</div><section class="card panel">' + head(T('Audit trail', 'ऑडिट ट्रेल'),
      T('Masked events across the same reference', 'उसी नंबर पर सुरक्षित घटनाएँ'), 'quote') +
    '<ol class="timeline">' + [...state.events].reverse().map(row => '<li class="done"><span class="status-point">' + icon('check') +
      '</span><div><strong>' + eventName(row.event) + '</strong><small>' + escape(row.actor) +
      (typeof row.monthly === 'number' && row.monthly > 0 ? ' · ' + money(row.monthly) : '') +
      '</small></div><span class="trace">' + escape(new Intl.DateTimeFormat(language === 'hi' ? 'hi-IN' : 'en-IN', {
        hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata'
      }).format(new Date(row.at))) + '</span></li>').join('') + '</ol></section></div></div>';
}

function render() {
  if (!config) return;
  document.documentElement.lang = language;
  $('#nav-owner').textContent = T('Owner journey', 'मालिक का सफ़र');
  $('#nav-ops').textContent = T('Operations', 'ऑपरेशंस');
  for (const view of ['owner', 'ops']) {
    const target = $('#nav-' + view);
    if (tab === view) target.setAttribute('aria-current', 'page');
    else target.removeAttribute('aria-current');
  }
  $('#language').textContent = T('हिंदी', 'English');
  $('#language').setAttribute('aria-label', T('Switch language to Hindi', 'अंग्रेज़ी में बदलें'));
  const sampleOpen = $('details.sample-profiles', main)?.open;
  main.innerHTML = tab === 'ops' ? showOps() : showOwner();
  if (sampleOpen && !state) $('details.sample-profiles', main).open = true;
  main.setAttribute('aria-busy', String(busy));
  const chat = $('#messages');
  if (chat) chat.scrollTop = chat.scrollHeight;
}
function go(view, work = false) {
  tab = view;
  history.replaceState(null, '', location.pathname + location.search + (view === 'owner' ? '' : '#' + view));
  render();
  if (work) $('#work-area')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  else window.scrollTo({ top: 0, behavior: 'instant' });
}
function openDialog(title, content) {
  if (dialog.open) dialog.close();
  dialog.innerHTML = '<div class="spread"><h2 id="dialog-title">' + title +
    '</h2><button type="button" class="dialog-close" data-act="closeDialog" aria-label="' + T('Close dialog', 'डायलॉग बंद करें') +
    '">' + icon('cross') + '</button></div>' + content;
  dialog.showModal();
}
function openResume(ref = '', code = '', withCode = false) {
  openDialog(T('Resume on web', 'वेब पर फिर खोलें'),
    '<p class="section-sub">' + T('Enter the case reference and its one-time code. The code expires in ten minutes.',
      'केस नंबर और एक बार का कोड भरें। कोड दस मिनट में समाप्त हो जाता है।') + '</p>' +
    (withCode ? '<div class="dialog-code">' + escape(code) + '</div>' : '') +
    '<form data-form="resume"><label class="field">' + T('Case reference', 'केस नंबर') +
    '<input name="id" maxlength="13" value="' + escape(ref) + '" placeholder="UD-0123456789" required></label>' +
    '<label class="field">' + T('One-time code', 'एक बार का कोड') +
    '<input name="code" maxlength="8" value="' + escape(code) + '" autocomplete="one-time-code" required></label><div class="actions">' +
    '<button type="submit" class="button button-primary">' + T('Resume case', 'केस खोलें') + icon('arrow') + '</button>' +
    (withCode ? b(T('Copy case and code', 'केस और कोड कॉपी करें'), 'copyCode', { small: true }) : '') +
    '</div><p class="chat-note">' + T('Redeeming the code transfers access from the original tab or device.',
      'कोड इस्तेमाल करने पर पुराने टैब या डिवाइस की पहुँच नए पर जाती है।') + '</p><div id="resume-error" role="alert"></div></form>');
}
async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    ping(T('Copied.', 'कॉपी हो गया।'));
  } catch {
    openDialog(T('Copy this text', 'यह टेक्स्ट कॉपी करें'),
      '<label class="field">' + T('Select and copy', 'चुनें और कॉपी करें') + '<input readonly value="' + escape(text) + '"></label>');
  }
}
async function perform(action, fields = {}) {
  const result = await api(endpoint(), { action, ...fields });
  useResult(result);
  return result;
}
async function start(channel, scenario, fixture) {
  const requestedPartner = new URL(location.href).searchParams.get('ref');
  const result = await api('/cases', { channel, scenario, fixture, language, partner: requestedPartner }, null);
  changeCase(result);
  go('owner', Boolean(scenario));
}
async function scanned(specimen, selected, update) {
  const documents = {};
  let handled = 0;
  for (const kind of kinds) {
    const blob = selected ? selected[kind] : await sampleImage(specimen, kind, session);
    if (!blob) continue;
    update?.(++handled, kind);
    const { synthetic, fields, quality } = await scanImage(blob, kind);
    if (synthetic || quality === 'blurred') documents[kind] = { synthetic, fields, quality };
  }
  return documents;
}
async function scanCase(selected) {
  const specimen = await api(endpoint() + '/specimen');
  try {
    const documents = await scanned(specimen, selected, (index, kind) => {
      progress = T('Reading ', 'पढ़ रहे हैं ') + tr(docNames[kind]) + ' · ' + index;
      render();
    });
    if (!Object.keys(documents).length) {
      ping(T('No readable synthetic proof found. Use a marked specimen.', 'कोई पढ़ने योग्य नमूना नहीं मिला। चिह्नित नमूना इस्तेमाल करें।'));
      return;
    }
    await perform('verify', { documents });
    uploads = {};
    if (state.phase === 'checkout') $('#work-area')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  } finally {
    progress = '';
  }
}
async function explainQuote() {
  if (config.hostedAi) explanation = await api(endpoint() + '/explain');
  if (explanation?.mode === 'genai') return;
  if (globalThis.LanguageModel && await LanguageModel.availability() === 'available') {
    try {
      const modelSession = await LanguageModel.create();
      try {
        const safeFacts = state.quote.lines.map(row => ({ name: row.name, use: row.detail }));
        const response = String(await modelSession.prompt(
          'Write two short sentences in ' + T('English', 'Hindi') +
          ' about how the following services fit a small business. Use only these services. Do not give prices, numbers, promises, or links. ' +
          JSON.stringify(safeFacts), { signal: AbortSignal.timeout(8000) })).trim();
        if (response && response.length < 560 && !/[\p{N}\p{Sc}<>]|https?:/iu.test(response)) {
          explanation = { text: response, mode: 'device' };
          return;
        }
      } finally {
        modelSession.destroy();
      }
    } catch { /* The deterministic explanation remains available. */ }
  }
  explanation = { mode: 'rules' };
  ping(T('Rules explanation shown. A GenAI model is unavailable in this session.',
    'नियम आधारित व्याख्या दिखाई गई। इस सत्र में GenAI मॉडल उपलब्ध नहीं है।'));
}

async function payment(fail) {
  const hold = state.hold;
  const result = await perform('pay', {
    key: state.id + '-checkout-' + state.quoteRevision, hold: hold?.id, revision: state.quoteRevision,
    amount: state.quote.monthly + state.quote.setup, fail
  });
  if (result.failed) note = T('Sandbox payment failed. The slot is still held. You can retry.', 'डेमो पेमेंट असफल हुआ। समय सुरक्षित है। फिर कोशिश करें।');
  else note = '';
}
function clearInfo() {
  note = '';
}

async function onAction(action, target) {
  const data = target.dataset;
  switch (action) {
    case 'language':
      language = language === 'en' ? 'hi' : 'en';
      save(keys.language, language);
      explanation = null;
      if (state) await perform('language', { language });
      break;
    case 'start': await start('whatsapp'); if (state) $('#work-area')?.scrollIntoView({ block: 'start', behavior: 'instant' }); break;
    case 'startWeb': await start('web'); break;
    case 'scenario': await start('whatsapp', data.scenario); break;
    case 'type': await perform('answer', { key: 'type', value: data.value }); break;
    case 'edit': explanation = null; await perform('edit'); break;
    case 'explain': await explainQuote(); break;
    case 'accept': await perform('acceptQuote', { revision: state.quoteRevision }); break;
    case 'scanSample': await scanCase(null); break;
    case 'scanUploads': await scanCase(uploads); break;
    case 'replaceMissing': await perform('replaceMissing'); break;
    case 'withdrawAsk':
      openDialog(T('Withdraw consent?', 'सहमति वापस लें?'), '<p class="section-sub">' +
        T('This clears verification results and closes this unpaid demo case.', 'यह सत्यापन परिणाम मिटाकर बिना पेमेंट वाले केस को बंद करता है।') +
        '</p><div class="actions">' + b(T('Withdraw and close case', 'सहमति वापस लेकर केस बंद करें'), 'withdraw', { primary: true }) +
        b(T('Continue case', 'केस जारी रखें'), 'closeDialog') + '</div>');
      break;
    case 'withdraw': await perform('withdraw'); uploads = {}; dialog.close(); break;
    case 'slot': clearInfo(); await perform('hold', { slot: data.slot, revision: state.quoteRevision }); break;
    case 'pay': await payment(false); break;
    case 'fail': await payment(true); break;
    case 'assist': await perform('assist'); ping(T('Request added to this case.', 'अनुरोध इसी केस में जुड़ा।')); break;
    case 'claim': await perform('claim'); break;
    case 'loadCase': {
      const entry = (stored(keys.cases) || []).find(item => item.id === data.id);
      if (!entry) break;
      try {
        const result = await api('/cases/' + entry.id, undefined, entry);
        changeCase({ ...result, token: entry.token });
      } catch (error) {
        if (['AUTH_REQUIRED', 'CASE_EXPIRED'].includes(error.message)) {
          save(keys.cases, (stored(keys.cases) || []).filter(item => item.id !== entry.id));
        }
        throw error;
      }
      break;
    }
    case 'partnerLink': await copy(location.origin + location.pathname + '?ref=' + state.partner); break;
    case 'review': await perform('review'); go('owner', true); break;
    case 'advance': clearInfo(); await perform('advance', { expectedStep: state.order.step }); break;
    case 'ops': go('ops'); break;
    case 'owner': go('owner', true); break;
    case 'refresh': useResult(await api(endpoint())); ping(T('Case updated.', 'केस अपडेट हुआ।')); break;
    case 'copyLink':
      await copy(location.origin + location.pathname + '#track=' + state.id);
      break;
    case 'issue': {
      const result = await perform('issueCode');
      openResume(state.id, result.code, true);
      break;
    }
    case 'openResume': openResume(); break;
    case 'copyCode': {
      const form = $('[data-form="resume"]', dialog);
      await copy(form.elements.id.value + ' · ' + form.elements.code.value);
      break;
    }
    case 'closeDialog': dialog.close(); break;
  }
}

function problem(error) {
  const code = error?.message;
  const msg = tr(errors[code] || ['This action could not finish. Please try again.', 'यह काम पूरा नहीं हुआ। फिर कोशिश करें।']);
  const alert = $('#resume-error', dialog);
  if (dialog.open && alert) {
    alert.textContent = msg;
    alert.className = 'notice red';
  } else ping(msg);
}
async function act(task) {
  if (busy) return;
  busy = true;
  main.setAttribute('aria-busy', 'true');
  try { await task(); } catch (error) { problem(error); }
  finally { busy = false; render(); }
}
document.addEventListener('click', event => {
  const nav = event.target.closest('[data-nav]');
  if (nav) {
    if (nav.tagName === 'A' && (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey)) return;
    event.preventDefault();
    if (!busy) go(nav.dataset.nav);
    return;
  }
  const button = event.target.closest('[data-act]');
  if (!button || button.disabled) return;
  void act(() => onAction(button.dataset.act, button));
});
document.addEventListener('change', event => {
  const input = event.target;
  if (input.dataset.toggle) void act(async () => {
    await perform('toggle', { key: input.dataset.toggle, enabled: input.checked, revision: state.quoteRevision });
    explanation = null;
  });
  if (input.dataset.upload && !busy) {
    if (input.files.length) uploads[input.dataset.upload] = input.files[0];
    else delete uploads[input.dataset.upload];
    render();
  }
});
document.addEventListener('submit', event => {
  const form = event.target;
  const kind = form.dataset.form;
  if (!kind) return;
  event.preventDefault();
  const data = new FormData(form);
  void act(async () => {
    if (kind === 'resume') {
      changeCase(await api('/resume', { id: data.get('id').trim().toUpperCase(), code: data.get('code').trim().toUpperCase() }, null));
      language = state.language;
      save(keys.language, language);
      dialog.close();
      go('owner', true);
    } else if (kind === 'fixture') {
      const fixture = data.get('fixture');
      if (config.fixtures.some(row => row.id === fixture)) await start('whatsapp', 'clinic', fixture);
    } else if (kind === 'intake') {
      if (!state) await start('web');
      await perform('intake', { text: data.get('text').trim() });
    } else if (kind === 'consent') {
      await perform('consent', { accepted: data.get('agree') === 'on', version: config.policyVersion });
    } else {
      const value = kind === 'location' ? { pin: data.get('pin').trim(), city: data.get('city').trim(), sites: Number(data.get('sites')) } :
        kind === 'tools' ? data.getAll('tool') : kind === 'gst' ? data.get('value').trim() : Number(data.get('value'));
      await perform('answer', { key: kind, value });
    }
  });
});
window.addEventListener('storage', event => {
  if (event.key !== keys.session || !state || busy) return;
  const latest = stored(keys.session);
  if (latest?.id !== state.id) return;
  session = latest;
  void act(async () => useResult(await api(endpoint())));
});

async function initialize() {
  try {
    config = await api('/config', null, null);
    const incomingResume = /^#resume=(UD-[A-F0-9]{10})\.([A-Z2-9]{8})$/.exec(location.hash);
    if (incomingResume) history.replaceState(null, '', location.pathname + location.search);
    tabFromUrl = /^#track=(UD-[A-F0-9]{10})$/.exec(location.hash)?.[1];
    if (session && (!tabFromUrl || session.id === tabFromUrl)) {
      try {
        useResult(await api('/cases/' + session.id));
        language = state.language;
      } catch {
        session = null;
        save(keys.session, null);
      }
    }
    render();
    if (incomingResume) openResume(incomingResume[1], incomingResume[2]);
    else if (tabFromUrl && state?.id !== tabFromUrl) openResume(tabFromUrl);
    else if (tabFromUrl && state?.order) $('#work-area')?.scrollIntoView({ block: 'start', behavior: 'instant' });
  } catch {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = '<div class="loading">The demo service is unavailable. Please reload the page.</div>';
  }
}
void initialize();
