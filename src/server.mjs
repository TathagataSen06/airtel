import {
  clock, catalogueVersion, policyVersion, catalogue, pins, slots, types, tools, scenarios,
  DomainError, deriveQuote, priority, specimens, publicSpecimen, evaluateEvidence
} from './domain.mjs';

const DAY = 86400000;
const MINUTE = 60000;
const authLifetime = DAY;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const refPattern = /^UD-[A-F0-9]{10}$/;
const partnerCodes = new Set(['JPR-07', 'JPR-12', 'DEL-03']);
const questionOrder = ['type', 'location', 'staff', 'tools', 'budget'];
const writer = new TextEncoder();

const hex = (bytes) => Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
const random = (n) => hex(crypto.getRandomValues(new Uint8Array(n)));
const hash = async (input) => hex(new Uint8Array(await crypto.subtle.digest('SHA-256', writer.encode(input))));
const date = () => new Date().toISOString();
const need = (condition, code, status = 400) => { if (!condition) throw new DomainError(code, status); };

function addEvent(state, event, actor = 'Journey', detail = {}) {
  state.events = [...state.events, { at: date(), event, actor, ...detail }].slice(-50);
}

function initialCase(body) {
  const picked = typeof body.scenario === 'string' && Object.hasOwn(scenarios, body.scenario) ? scenarios[body.scenario] : null;
  const fixture = typeof body.fixture === 'string' && /^K(?:0[1-9]|1[012])$/.test(body.fixture) && Object.hasOwn(specimens, body.fixture) ? body.fixture : null;
  const profile = picked
    ? { type: picked.type, sites: picked.sites, pin: picked.pin, staff: picked.staff, tools: picked.tools, budget: picked.budget }
    : {};
  const partner = partnerCodes.has(body.partner) ? body.partner : picked?.partner || null;
  const state = {
    id: 'UD-' + random(5).toUpperCase(), phase: picked ? 'quote' : 'advisor', profile,
    channel: body.channel === 'web' ? 'web' : 'whatsapp', partner,
    fixture: fixture || picked?.fixture || null, language: body.language === 'hi' ? 'hi' : 'en',
    scenario: picked ? body.scenario : 'custom', asked: picked ? 5 : 0,
    quote: picked ? deriveQuote(profile) : null, quoteRevision: picked ? 1 : 0,
    consent: null, kyc: null, hold: null, order: null, assist: null, events: []
  };
  addEvent(state, 'CASE_STARTED', 'Journey', { channel: state.channel });
  if (partner) addEvent(state, 'PARTNER_ATTACHED', 'Partner', { partner });
  if (picked) addEvent(state, 'QUOTE_READY', 'Catalogue rules', { monthly: state.quote.monthly });
  return state;
}

function acceptAnswer(state, key, value) {
  need(state.phase === 'advisor' && questionOrder[state.asked] === key, 'WRONG_STEP', 409);
  const p = state.profile;
  switch (key) {
    case 'type':
      need(types.includes(value), 'INVALID_TYPE');
      p.type = value;
      break;
    case 'location':
      need(typeof value?.pin === 'string' && /^[1-9]\d{5}$/.test(value.pin) &&
        Number.isInteger(value.sites) && value.sites >= 1 && value.sites <= 100, 'INVALID_LOCATION');
      p.pin = value.pin;
      p.sites = value.sites;
      break;
    case 'staff':
      need(Number.isInteger(value) && value > 0 && value <= 500, 'INVALID_SIZE');
      p.staff = value;
      break;
    case 'tools':
      need(Array.isArray(value) && value.length > 0 && value.length <= tools.length &&
        value.every(tool => tools.includes(tool)) && (value.length === 1 || !value.includes('none')), 'INVALID_TOOLS');
      p.tools = [...new Set(value)];
      break;
    case 'budget':
      need(Number.isInteger(value) && value >= 300 && value <= 500000, 'INVALID_BUDGET');
      p.budget = value;
      break;
  }
  state.asked += 1;
  if (state.asked === 5) {
    state.quote = deriveQuote(p);
    state.quoteRevision += 1;
    state.phase = 'quote';
    state.fixture ??= p.type === 'retail' ? 'D02' : 'D01';
    addEvent(state, 'QUOTE_READY', 'Catalogue rules', { monthly: state.quote.monthly });
  }
}

function currentQuote(state, revision) {
  need(state.quoteRevision === revision, 'QUOTE_CHANGED', 409);
  const q = deriveQuote(state.profile, state.quote?.options);
  need(q.route === 'self' && q.version === state.quote.version && q.monthly === state.quote.monthly &&
    q.setup === state.quote.setup && JSON.stringify(q.lines) === JSON.stringify(state.quote.lines), 'QUOTE_CHANGED', 409);
  return q;
}

function present(state) {
  return {
    ...state,
    priority: priority(state),
    hold: state.hold && { ...state.hold, expired: state.hold.expires <= Date.now() },
    evidencePolicy: state.fixture ? publicSpecimen(state.fixture).required : null
  };
}

function routeAssist(state, type) {
  state.assist = { type, state: 'queued', at: date() };
  addEvent(state, 'ASSISTANCE_QUEUED', 'Journey', { route: type });
}

function apply(state, input) {
  switch (input.action) {
    case 'language':
      need(['en', 'hi'].includes(input.language), 'INVALID_LANGUAGE');
      state.language = input.language;
      break;
    case 'answer':
      acceptAnswer(state, input.key, input.value);
      break;
    case 'edit':
      need(state.phase === 'quote' && !state.consent, 'WRONG_STEP', 409);
      state.phase = 'advisor';
      state.asked = 0;
      state.quote = null;
      if (state.scenario === 'custom') state.fixture = null;
      break;
    case 'toggle': {
      need(state.phase === 'quote', 'WRONG_STEP', 409);
      const old = currentQuote(state, input.revision);
      const key = input.key;
      need((key === 'backup' && old.canBackup || key === 'pos' && old.canPos) &&
        typeof input.enabled === 'boolean', 'SKU_INELIGIBLE');
      if (old.options[key] === input.enabled) break;
      state.quote = deriveQuote(state.profile, { ...old.options, [key]: input.enabled });
      state.quoteRevision += 1;
      addEvent(state, 'QUOTE_REPRICED', 'Catalogue rules', {
        monthly: state.quote.monthly, saved: old.monthly - state.quote.monthly
      });
      break;
    }
    case 'acceptQuote':
      need(state.phase === 'quote', 'WRONG_STEP', 409);
      currentQuote(state, input.revision);
      state.phase = 'kyc';
      addEvent(state, 'QUOTE_ACCEPTED', 'Owner');
      break;
    case 'consent':
      need(state.phase === 'kyc' && input.accepted === true && input.version === policyVersion, 'CONSENT_REQUIRED');
      if (!state.consent) {
        state.consent = { version: policyVersion, at: date(), purpose: 'subscriber intake for this demo order' };
        addEvent(state, 'CONSENT_RECORDED', 'Owner');
      }
      break;
    case 'withdraw':
      need(state.consent && ['kyc', 'checkout'].includes(state.phase), 'WRONG_STEP', 409);
      state.consent = null;
      state.kyc = null;
      state.hold = null;
      state.assist = null;
      state.phase = 'closed';
      addEvent(state, 'CONSENT_WITHDRAWN', 'Owner');
      break;
    case 'verify': {
      need(state.phase === 'kyc' && state.consent, 'CONSENT_REQUIRED', 409);
      need(state.kyc?.status !== 'review', 'REVIEW_IN_PROGRESS', 409);
      const result = evaluateEvidence(state.fixture, input.documents);
      state.kyc = { ...result, at: date() };
      if (result.status === 'cleared') {
        if (state.assist?.type === 'kyc') state.assist = null;
        state.phase = 'checkout';
        addEvent(state, 'KYC_CLEARED', 'Verification rules');
      } else if (result.status === 'review') {
        addEvent(state, 'KYC_REVIEW_HOLD', 'Verification rules');
        routeAssist(state, 'kyc');
      } else addEvent(state, 'KYC_CORRECTION_NEEDED', 'Verification rules');
      break;
    }
    case 'review': {
      need(state.phase === 'kyc' && state.kyc?.status === 'review', 'REVIEW_NOT_PENDING', 409);
      state.kyc.status = 'correction';
      if (['K01', 'K05'].includes(state.fixture)) state.fixture += 'R';
      state.assist = null;
      addEvent(state, 'REVIEW_RETURNED', 'Verification desk');
      break;
    }
    case 'replaceMissing':
      need(state.phase === 'kyc' && state.kyc?.status === 'correction' && state.fixture === 'K05',
        'WRONG_STEP', 409);
      state.fixture = 'K05R';
      addEvent(state, 'REPLACEMENT_PROOF_REQUESTED', 'Owner');
      break;
    case 'assist': {
      need(state.phase !== 'closed', 'WRONG_STEP', 409);
      if (state.assist) break;
      const route = ['complex', 'survey'].includes(state.quote?.route) ? state.quote.route : 'callback';
      routeAssist(state, route);
      if (state.phase === 'quote' && route !== 'callback') state.phase = 'assisted';
      break;
    }
    case 'claim':
      need(state.assist?.state === 'queued', 'ASSISTANCE_NOT_PENDING', 409);
      state.assist.state = 'assigned';
      addEvent(state, 'ASSISTANCE_ASSIGNED', state.assist.type === 'kyc' ? 'Verification desk' : 'Field desk');
      break;
    case 'hold': {
      need(state.phase === 'checkout' && state.kyc?.status === 'cleared' && state.consent, 'KYC_GATE', 409);
      currentQuote(state, input.revision);
      const slot = slots.find(slot => slot.id === input.slot);
      need(slot, 'INVALID_SLOT');
      state.hold = { id: 'SL-' + random(4).toUpperCase(), slot: slot.id, expires: Date.now() + 10 * MINUTE,
        quoteRevision: state.quoteRevision };
      addEvent(state, 'SLOT_HELD', 'Installation desk', { slot: slot.id });
      break;
    }
    case 'advance':
      need(state.order && state.order.step < 3, 'WRONG_STEP', 409);
      need(state.order.step === input.expectedStep, 'CASE_UPDATED', 409);
      state.order.step += 1;
      addEvent(state, ['ORDER_CREATED', 'INSTALL_STARTED', 'CONNECTIVITY_LIVE', 'ALL_ACTIVE'][state.order.step], 'Fulfilment adapter');
      if (state.order.step === 3 && state.partner && !state.order.referralCredited) {
        state.order.referralCredited = true;
        addEvent(state, 'PARTNER_CREDITED', 'Partner ledger', { partner: state.partner });
      }
      break;
    default:
      throw new DomainError('UNKNOWN_ACTION');
  }
}

async function rowById(db, id) {
  const row = await db.prepare('SELECT * FROM cases WHERE id = ?').bind(id).first();
  need(row && row.updated_at > Date.now() - authLifetime, 'CASE_EXPIRED', 404);
  return row;
}

async function authorize(db, request, id) {
  const auth = request.headers.get('Authorization') || '';
  need(/^Bearer [a-f0-9]{64}$/.test(auth), 'AUTH_REQUIRED', 401);
  const row = await rowById(db, id);
  need(row.token_hash === await hash(auth.slice(7)), 'AUTH_REQUIRED', 401);
  return row;
}

async function save(db, row, state) {
  const result = await db.prepare('UPDATE cases SET state = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
    .bind(JSON.stringify(state), Date.now(), row.id, row.revision).run();
  return Number(result.meta.changes) === 1;
}

async function create(db, body) {
  const state = initialCase(body);
  const token = random(32);
  await db.prepare('DELETE FROM cases WHERE updated_at <= ?').bind(Date.now() - authLifetime).run();
  await db.prepare('INSERT INTO cases (id, token_hash, state, updated_at) VALUES (?, ?, ?, ?)')
    .bind(state.id, await hash(token), JSON.stringify(state), Date.now()).run();
  return { state: present(state), token };
}

async function issueCode(db, row, state) {
  need(!['closed'].includes(state.phase), 'WRONG_STEP', 409);
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => alphabet[byte % alphabet.length]).join('');
  const expires = Date.now() + 10 * MINUTE;
  addEvent(state, 'RESUME_ISSUED', 'WhatsApp simulator');
  const result = await db.prepare('UPDATE cases SET state = ?, resume_hash = ?, resume_expires = ?, resume_tries = 0, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
    .bind(JSON.stringify(state), await hash(row.id + code), expires, Date.now(), row.id, row.revision).run();
  need(result.meta.changes === 1, 'CASE_UPDATED', 409);
  return { state: present(state), code, expires };
}

async function redeem(db, body) {
  need(typeof body.id === 'string' && refPattern.test(body.id) && typeof body.code === 'string' &&
    /^[A-Z2-9]{8}$/.test(body.code), 'BAD_CODE', 400);
  const row = await rowById(db, body.id);
  need(row.resume_hash && row.resume_expires > Date.now() && row.resume_tries < 5, 'CODE_EXPIRED', 409);
  if (row.resume_hash !== await hash(body.id + body.code)) {
    await db.prepare('UPDATE cases SET resume_tries = resume_tries + 1 WHERE id = ? AND resume_hash = ?').bind(row.id, row.resume_hash).run();
    throw new DomainError('BAD_CODE', 400);
  }
  const state = JSON.parse(row.state);
  state.channel = 'web';
  addEvent(state, 'CASE_RESUMED', 'Owner');
  const token = random(32);
  const result = await db.prepare('UPDATE cases SET token_hash = ?, resume_hash = NULL, resume_expires = NULL, resume_tries = 0, state = ?, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ? AND resume_hash = ? AND resume_tries < 5')
    .bind(await hash(token), JSON.stringify(state), Date.now(), row.id, row.revision, row.resume_hash).run();
  need(result.meta.changes === 1, 'CODE_EXPIRED', 409);
  return { state: present(state), token };
}

async function pay(db, request, id, input) {
  need(typeof input.key === 'string' && /^[A-Za-z0-9-]{12,80}$/.test(input.key), 'INVALID_RETRY_KEY');
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const row = await authorize(db, request, id);
    const state = JSON.parse(row.state);
    if (state.order) return { state: present(state), replayed: true };
    need(state.phase === 'checkout' && state.kyc?.status === 'cleared' && state.consent, 'KYC_GATE', 409);
    const quote = currentQuote(state, input.revision);
    need(state.hold && state.hold.id === input.hold && state.hold.expires > Date.now() &&
      state.hold.quoteRevision === state.quoteRevision, 'HOLD_EXPIRED', 409);
    need(input.amount === quote.monthly + quote.setup, 'QUOTE_CHANGED', 409);
    if (input.fail === true) {
      addEvent(state, 'PAYMENT_RETRYABLE', 'Payment simulator');
      if (!await save(db, row, state)) continue;
      return { state: present(state), failed: true };
    }
    const suffix = state.id.slice(3);
    state.order = { id: 'ORD-' + suffix, payment: 'SIM-' + suffix, slot: state.hold.slot,
      amount: input.amount, step: 0, at: date(), referralCredited: false };
    state.phase = 'tracker';
    addEvent(state, 'ORDER_CREATED', 'Payment simulator');
    if (await save(db, row, state)) return { state: present(state), replayed: false };
  }
  throw new DomainError('CASE_UPDATED', 409);
}

async function generateExplanation(state, env) {
  if (!env.OPENAI_API_KEY || state.quote?.route !== 'self') return { mode: 'rules' };
  const input = {
    language: state.language === 'hi' ? 'Hindi' : 'English',
    business: state.profile.type, staff: state.profile.staff, tools: state.profile.tools,
    items: state.quote.lines.map(row => ({ name: row.name, use: row.detail })),
    coverage: state.quote.area.code
  };
  try {
    const response = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + env.OPENAI_API_KEY, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: env.OPENAI_MODEL || 'gpt-4.1-mini', store: false, max_output_tokens: 180,
        instructions: 'Write two short customer-facing sentences in the given language about how the listed services help the business. Use only the listed items. Include no prices, numbers, promises, or links. Return plain text.',
        input: JSON.stringify(input)
      }),
      signal: AbortSignal.timeout(6500)
    });
    if (!response.ok) return { mode: 'rules' };
    const payload = await response.json();
    const text = payload.output?.flatMap(block => block.content || []).find(part => part.type === 'output_text')?.text?.trim();
    if (text && text.length <= 560 && !/[\d₹$<>]|https?:/i.test(text)) return { mode: 'genai', text };
  } catch {
    return { mode: 'rules' };
  }
  return { mode: 'rules' };
}

const json = (data, status = 200) => Response.json(data, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }
});

async function readBody(request) {
  const data = await request.text();
  need(data.length <= 20000, 'PAYLOAD_TOO_LARGE', 413);
  try {
    const parsed = JSON.parse(data);
    need(parsed && typeof parsed === 'object' && !Array.isArray(parsed), 'INVALID_REQUEST');
    return parsed;
  } catch {
    throw new DomainError('INVALID_REQUEST');
  }
}

async function handleApi(request, url, env) {
  const path = url.pathname;
  if (request.method === 'GET' && path === '/api/config') {
    return json({ clock, catalogueVersion, policyVersion, pins, slots,
      addOns: { backup: catalogue.P09, pos: catalogue.P19 },
      fixtures: Object.entries(specimens).filter(([key]) => /^K\d\d$/.test(key)).map(([id, { description }]) => ({ id, description })),
      hostedAi: Boolean(env.OPENAI_API_KEY) });
  }

  const db = env.DB;
  need(db, 'DATA_UNAVAILABLE', 503);
  if (request.method === 'POST') {
    need(!request.headers.get('Origin') || request.headers.get('Origin') === url.origin, 'AUTH_REQUIRED', 403);
    if (path === '/api/cases') return json(await create(db, await readBody(request)), 201);
    if (path === '/api/resume') return json(await redeem(db, await readBody(request)));
  }

  const match = /^\/api\/cases\/(UD-[A-F0-9]{10})(?:\/(specimen|explain))?$/.exec(path);
  need(match, 'NOT_FOUND', 404);
  const [, id, sub] = match;
  if (request.method === 'GET') {
    const state = JSON.parse((await authorize(db, request, id)).state);
    if (sub === 'specimen') {
      need(state.consent && state.phase === 'kyc', 'CONSENT_REQUIRED', 403);
      return json(publicSpecimen(state.fixture));
    }
    if (sub === 'explain') return json(await generateExplanation(state, env));
    return json({ state: present(state) });
  }
  need(request.method === 'POST' && !sub, 'NOT_FOUND', 404);
  const input = await readBody(request);
  if (input.action === 'pay') return json(await pay(db, request, id, input));
  const row = await authorize(db, request, id);
  const state = JSON.parse(row.state);
  if (input.action === 'issueCode') return json(await issueCode(db, row, state));
  apply(state, input);
  need(await save(db, row, state), 'CASE_UPDATED', 409);
  return json({ state: present(state) });
}

export async function route(request, env, asset) {
  const url = new URL(request.url);
  if (!url.pathname.startsWith('/api/')) return asset(url.pathname, request.method);
  try {
    return await handleApi(request, url, env);
  } catch (error) {
    if (error instanceof DomainError) return json({ error: error.code }, error.status);
    console.error('Journey service error', error?.name);
    return json({ error: 'SERVICE_ERROR' }, 500);
  }
}
