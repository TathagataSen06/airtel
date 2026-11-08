import { types, tools } from './catalogue.mjs';
import { canonicalCity, cityInText } from './geography.mjs';

export const questionOrder = ['type', 'location', 'staff', 'tools', 'budget', 'gst'];

const typeTerms = {
  clinic: /clinic|dental|hospital|diagnostic|physio|क्लिनिक|दवाखान|अस्पताल/,
  restaurant: /restaurant|cafe|café|eatery|dhaba|रेस्टोरेंट|रेस्तराँ|ढाबा/,
  warehouse: /warehouse|godown|depot|गोदाम/,
  factory: /manufactur|factory|textile unit|assembly|machine shop|कारखान|फैक्ट्री|निर्माण/,
  pharmacy: /pharmacy|chemist|medical store|फार्मेसी|दवा की दुकान/,
  salon: /salon|barber|beauty parlo|सैलून|ब्यूटी पार्लर/,
  coaching: /coaching|tuition|training centre|कोचिंग|ट्यूशन/,
  hotel: /hotel|guest house|होटल/,
  logistics: /logistics|transporter|transport company|delivery service|लॉजिस्टिक्स|ट्रांसपोर्ट/,
  office: /professional|office|\bca\b|chartered accountant|law firm|agency|studio|ऑफिस|कार्यालय|सीए/,
  retail: /shop|retail|kirana|store|boutique|bakery|दुकान|किराना|स्टोर/,
  multisite: /multi.?site|chain|branches|शाखा/
};

const needTerms = {
  hotspot: /hotspot|हॉटस्पॉट/,
  broadband: /broadband|ब्रॉडबैंड/,
  outages: /outage|failover|internet backup|backup (?:internet|line)|power cuts?|downtime|internet drops?|बैकअप इंटरनेट|इंटरनेट.{0,10}(?:बंद|कट)/,
  pos: /\bpos\b|billing|inventory|बिलिंग|स्टॉक/,
  email: /e.?mail|office suite|ईमेल/,
  cctv: /cctv|security camera|surveillance|कैमर|सीसीटीवी/,
  'guest-wifi': /wi[\s-]?fi|वाइ[\s-]?फ़ाई|वाई[\s-]?फाई/,
  'static-ip': /static\s+ip|fixed\s+ip|स्टैटिक आईपी/,
  firewall: /firewall|फ़ायरवॉल|फायरवॉल/,
  sdwan: /sd[\s-]?wan|central(?:ised|ized) network|सेंट्रल नेटवर्क/,
  calls: /telephony|\bivr\b|\bsip\b|call(?:s|ing| recording| routing)?\b|कॉल|आईवीआर/,
  whatsapp: /whats\s?app|व्हाट्सऐप|व्हाट्सएप|वॉट्सऐप/,
  sms: /\bsms\b|text alerts|एसएमएस/,
  'toll-free': /toll[\s-]?free|\b1800\b|टोल[\s-]?फ्री/,
  iot: /\biot\b|machine monitoring|sensors?|मशीन मॉनिटरिंग|सेंसर/,
  fleet: /fleet|vehicle track|truck track|gps track|फ़्लीट|वाहन ट्रैकिंग|फ्लीट/,
  website: /website|domain|वेबसाइट|डोमेन/,
  'cloud-backup': /cloud (?:backup|storage)|data backup|क्लाउड (?:बैकअप|स्टोरेज)/,
  security: /endpoint|antivirus|ransomware|device security|एंटीवायरस|डिवाइस सुरक्षा/,
  'business-sim': /\bsims?\b|business mobile|सिम/,
  'mobile-plus': /roaming|premium (?:sim|mobile)|रोमिंग/,
  'leased-line': /leased line|dedicated (?:link|line|internet|bandwidth)|लीज़्ड लाइन|लीज लाइन|डेडिकेटेड/,
  gigabit: /gigabit|1\s*g(?:bps)?\b|गीगाबिट/
};

const numberWords = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  एक: 1, दो: 2, तीन: 3, चार: 4, पाँच: 5, पांच: 5, छह: 6, छः: 6, सात: 7, आठ: 8, नौ: 9, दस: 10
};
const spokenNumber = '(\\d{1,3}|' + Object.keys(numberWords).join('|') + ')';
const gstPattern = /\b[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][A-Z0-9]Z[A-Z0-9]\b/i;

function normalizeDigits(text) {
  return text.replace(/[०-९]/g, digit => String('०१२३४५६७८९'.indexOf(digit)));
}

function intakeCount(text, nouns) {
  const before = text.match(new RegExp('(?:^|[^\\p{L}\\p{N}\\p{M}])' + spokenNumber + '\\s*(?:' + nouns + ')(?=$|[^\\p{L}\\p{N}\\p{M}])', 'u'));
  return before ? numberWords[before[1]] ?? Number(before[1]) : undefined;
}

function intakeMoney(text, next) {
  const amount = '(\\d[\\d,]*(?:\\.\\d+)?)\\s*(k|thousand|hazar|हज़ार|हजार|lakh|lac|लाख)?';
  const match = text.match(new RegExp('(?:budget|बजट|₹|\\binr\\b|\\brs\\.?)\\s*(?:is|of|है|लगभग)?\\s*' + amount, 'u'))
    || text.match(new RegExp(amount + '\\s*(?:rupees|रुपये|रुपए|per month|/mo\\b|प्रति माह|महीना)', 'u'))
    || (next === 'budget' && text.match(new RegExp('^' + amount + '$', 'u')));
  if (!match) return undefined;
  const scale = /^(lakh|lac|लाख)$/.test(match[2] || '') ? 100000 : match[2] ? 1000 : 1;
  return Math.round(Number(match[1].replaceAll(',', '')) * scale);
}

export function cleanProfile(partial) {
  const result = {};
  if (!partial || typeof partial !== 'object' || Array.isArray(partial)) return result;
  if (types.includes(partial.type)) result.type = partial.type;
  if (typeof partial.pin === 'string' && /^[1-9]\d{5}$/.test(partial.pin)) result.pin = partial.pin;
  const city = canonicalCity(partial.city);
  if (city) result.city = city;
  for (const [field, min, max] of [['sites', 1, 100], ['staff', 1, 500], ['budget', 300, 500000],
    ['cameras', 1, 500], ['machines', 1, 500], ['vehicles', 1, 500]]) {
    const value = partial[field];
    if (Number.isInteger(value) && value >= min && value <= max) result[field] = value;
  }
  if (Array.isArray(partial.tools)) {
    result.tools = [...new Set(partial.tools.filter(tool => tools.includes(tool) && tool !== 'none'))];
  }
  return result;
}

export function parseProfileText(message, next) {
  const text = normalizeDigits(message).toLowerCase().trim();
  const parsed = {
    type: Object.keys(typeTerms).find(type => typeTerms[type].test(text)),
    pin: text.match(/\b[1-9]\d{5}\b/)?.[0],
    city: cityInText(text),
    sites: intakeCount(text, 'sites?|locations?|shops?|stores?|branches|outlets?|दुकान(?:ें|ों)?|शाखा(?:एँ|एं|ओं)?|स्थान|साइट'),
    staff: intakeCount(text, 'staff|employees?|people|workers?|users?|लोग|कर्मचारी|सदस्य'),
    cameras: intakeCount(text, 'cameras?|कैमर(?:े|ा)'),
    vehicles: intakeCount(text, 'vehicles?|trucks?|वाहन|ट्रक'),
    machines: intakeCount(text, 'machines?|sensors?|मशीन(?:ें|ों)?|सेंसर'),
    budget: intakeMoney(text, next)
  };
  const found = Object.entries(needTerms).filter(([, pattern]) => pattern.test(text)).map(([need]) => need);
  if (found.length) parsed.tools = found;
  if (/^(?:none|no needs|कुछ नहीं|कोई नहीं|नहीं)$/u.test(text) && next === 'tools') parsed.tools = [];
  if ((next === 'staff' || next === 'location') && /^\d{1,3}$/.test(text)) parsed[next === 'staff' ? 'staff' : 'sites'] = Number(text);
  if (parsed.pin && parsed.sites === undefined && next === 'location') parsed.sites = 1;
  if (/^(?:one|single|एक)\s*(?:site|shop|location|दुकान|स्थान)/u.test(text)) parsed.sites = 1;

  const gstin = text.match(gstPattern)?.[0].toUpperCase();
  const skipGst = /\b(?:no gst(?:in)?|without gst(?:in)?|unregistered|skip gst(?:in)?)\b|(?:जीएसटी|gst(?:in)?)\s*नहीं/u.test(text)
    || (next === 'gst' && /^(?:skip|none|no|छोड़ें|नहीं)$/u.test(text));
  return { ...cleanProfile(parsed), ...(gstin ? { gstin } : skipGst ? { gstin: '' } : {}) };
}

export function nextQuestion(profile) {
  if (!profile.type) return 'type';
  if (!profile.sites || !(profile.pin || profile.city)) return 'location';
  if (!profile.staff) return 'staff';
  if (!Array.isArray(profile.tools)) return 'tools';
  if (!profile.budget) return 'budget';
  if (!profile.gstStatus) return 'gst';
  return null;
}

export function redactIntake(text) {
  return normalizeDigits(text)
    .replace(new RegExp(gstPattern.source, 'gi'), '[GSTIN]')
    .replace(/\b[A-Z]{5}\d{4}[A-Z]\b/gi, '[ID]')
    .replace(/\b[^\s@]+@[^\s@]+\.[^\s@]+\b/g, '[email]')
    .replace(/(?:\+91[ -]?)?\b\d{10,12}\b/g, '[phone]');
}
