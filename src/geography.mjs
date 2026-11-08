import { cityTiers } from './data.mjs';

export const cities = {
  Delhi: ['दिल्ली', ['new delhi', 'नई दिल्ली', 'delhi ncr'], '110'],
  Mumbai: ['मुंबई', ['bombay'], '400'],
  Bengaluru: ['बेंगलुरु', ['bangalore', 'बैंगलोर', 'बंगलौर'], '560'],
  Hyderabad: ['हैदराबाद', [], '500'],
  Chennai: ['चेन्नई', ['madras'], '600'],
  Pune: ['पुणे', ['poona'], '411'],
  Kolkata: ['कोलकाता', ['calcutta'], '700'],
  Ahmedabad: ['अहमदाबाद', [], '380'],
  Vadodara: ['वडोदरा', ['baroda', 'बड़ौदा'], '390'],
  Kochi: ['कोच्चि', ['cochin', 'ernakulam'], '682'],
  Ludhiana: ['लुधियाना', [], '141'],
  Indore: ['इंदौर', [], '452'],
  Nagpur: ['नागपुर', [], '440'],
  Lucknow: ['लखनऊ', [], '226'],
  Bhopal: ['भोपाल', [], '462'],
  Jaipur: ['जयपुर', [], '302'],
  Mysuru: ['मैसूर', ['mysore', 'मैसूरु'], '570'],
  Coimbatore: ['कोयंबटूर', [], '641'],
  Nashik: ['नाशिक', ['nasik', 'नासिक'], '422'],
  Visakhapatnam: ['विशाखापत्तनम', ['vizag', 'vishakhapatnam', 'विशाखापट्टनम'], '530'],
  Patna: ['पटना', [], '800'],
  Surat: ['सूरत', [], '395']
};

export const pins = {
  '302017': { city: 'Jaipur', fibre: true, wireless: true },
  '110024': { city: 'Delhi', fibre: true, wireless: true },
  '302029': { city: 'Jaipur', fibre: false, wireless: true },
  '110059': { city: 'Delhi', fibre: false, wireless: true },
  '302028': { city: 'Jaipur', fibre: false, wireless: false },
  '530016': { city: 'Visakhapatnam', fibre: true, wireless: true }
};

const cityLabels = Object.entries(cities).flatMap(([city, [hi, aliases]]) =>
  [city, hi, ...aliases].map(label => [label.toLowerCase(), city])
).sort((a, b) => b[0].length - a[0].length);

export function canonicalCity(input) {
  const name = typeof input === 'string' ? input.trim().toLowerCase() : '';
  return cityLabels.find(([label]) => name === label)?.[1] ?? '';
}

export function cityInText(text) {
  const words = ' ' + text.toLowerCase().replace(/[^\p{L}\p{M}\p{N}]+/gu, ' ') + ' ';
  return cityLabels.find(([label]) => words.includes(' ' + label + ' '))?.[1] ?? '';
}

export function coverage(pin, statedCity = '') {
  const exact = pins[pin];
  const prefix = typeof pin === 'string' && /^[1-9]\d{5}$/.test(pin) ? pin.slice(0, 3) : '';
  const city = exact?.city || Object.keys(cities).find(name => cities[name][2] === prefix) || canonicalCity(statedCity);
  const tier = cityTiers[city] ?? 2;
  return {
    city, hi: cities[city]?.[0] || '', tier,
    fibre: exact?.fibre ?? true, wireless: exact?.wireless ?? false,
    code: exact ? (exact.fibre ? 'fibre' : exact.wireless ? 'wireless' : 'none') : 'provisional',
    confirmed: Boolean(exact)
  };
}
