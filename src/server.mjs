import {
  clock, policyVersion, slots, scenarios, DomainError, priority, specimens, publicSpecimen,
  evaluateEvidence, checkRegistration, readEvidenceGstin
} from './domain.mjs';
import { catalogue, catalogueVersion, types, tools, deriveQuote, skuEligible } from './catalogue.mjs';
import { canonicalCity, coverage, pins } from './geography.mjs';
import { questionOrder, nextQuestion } from './intake.mjs';
import { modelProvider, understandProfile, explainWithModel } from './models.mjs';
import { handleWhatsApp, waReply } from './whatsapp.mjs';

const DAY = 86400000;
const MINUTE = 60000;
const authLifetime = DAY;
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const refPattern = /^UD-[A-F0-9]{10}$/;
const partnerCodes = new Set(['JPR-07', 'JPR-12', 'DEL-03']);
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
    ? { type: picked.type, sites: picked.sites, pin: picked.pin, staff: picked.staff, tools: picked.tools, budget: picked.budget, gstStatus: 'none', gstVerified: false }
    : {};
  const partner = partnerCodes.has(body.partner) ? body.partner : picked?.partner || null;
  const state = {
    id: 'UD-' + random(5).toUpperCase(), phase: picked ? 'quote' : 'advisor', profile,
    channel: body.channel === 'web' ? 'web' : 'whatsapp', partner,
    fixture: fixture || picked?.fixture || null, language: body.language === 'hi' ? 'hi' : 'en',
    scenario: picked ? body.scenario : 'custom', asked: picked ? questionOrder.length : 0,
    quote: picked ? deriveQuote(profile) : null, quoteRevision: picked ? 1 : 0,
    consent: null, kyc: null, hold: null, order: null, assist: null, events: []
  };
  addEvent(state, 'CASE_STARTED', 'Journey', { channel: state.channel });
  if (partner) addEvent(state, 'PARTNER_ATTACHED', 'Partner', { partner });
  if (picked) addEvent(state, 'QUOTE_READY', 'Catalogue rules', { monthly: state.quote.monthly });
  return state;
}

function finishIntake(state) {
  const next = nextQuestion(state.profile);
  state.asked = next ? questionOrder.indexOf(next) : questionOrder.length;
  if (next) return;
  state.quote = deriveQuote(state.profile);
  state.quoteRevision += 1;
  state.phase = 'quote';
  state.previousProfile = null;
  addEvent(state, 'QUOTE_READY', 'Catalogue rules', { monthly: state.quote.monthly });
}

async function recordGst(state, value) {
  need(typeof value === 'string' && value.length <= 30, 'INVALID_GST');
  delete state.profile.gstReference;
  Object.assign(state.profile, checkRegistration(value));
  state.registrationHash = state.profile.gstVerified ? await hash(value.trim().toUpperCase()) : null;
}

async function acceptAnswer(state, key, value) {
  need(state.phase === 'advisor' && nextQuestion(state.profile) === key, 'WRONG_STEP', 409);
  const p = state.profile;
  switch (key) {
    case 'type':
      need(types.includes(value), 'INVALID_TYPE');
      p.type = value;
      break;
    case 'location': {
      const pin = typeof value?.pin === 'string' ? value.pin : '';
      const city = canonicalCity(value?.city);
      need((pin ? /^[1-9]\d{5}$/.test(pin) : city) &&
        Number.isInteger(value?.sites) && value.sites >= 1 && value.sites <= 100, 'INVALID_LOCATION');
      Object.assign(p, { pin, city, sites: value.sites });
      break;
    }
    case 'staff':
      need(Number.isInteger(value) && value > 0 && value <= 500, 'INVALID_SIZE');
      p.staff = value;
      break;
    case 'tools':
      need(Array.isArray(value) && value.length <= tools.length &&
        value.every(tool => tools.includes(tool)) && (value.length <= 1 || !value.includes('none')), 'INVALID_TOOLS');
      p.tools = [...new Set(value.filter(tool => tool !== 'none'))];
      break;
    case 'budget':
      need(Number.isInteger(value) && value >= 300 && value <= 500000, 'INVALID_BUDGET');
      p.budget = value;
      break;
    case 'gst':
      await recordGst(state, value);
      break;
  }
  finishIntake(state);
}

async function addIntakeText(state, input, env) {
  need(state.phase === 'advisor' && typeof input === 'string' && input.trim() && input.length <= 1200, 'INVALID_MESSAGE');
  const { facts, mode } = await understandProfile(input, nextQuestion(state.profile), env);
  const { gstin, tools: selected, ...profile } = facts;
  need(Object.keys(facts).length > 0, 'INTAKE_NOT_UNDERSTOOD');
  Object.assign(state.profile, profile);
  if (selected) state.profile.tools = selected.length ? [...new Set([...(state.profile.tools || []), ...selected])] : [];
  if (gstin !== undefined) await recordGst(state, gstin);
  state.intakeMode = mode;
  finishIntake(state);
}

function currentQuote(state, revision, purchasable = true) {
  need(state.quoteRevision === revision && state.quote, 'QUOTE_CHANGED', 409);
  const original = state.quote;
  if (original.version === 'A26.07' && ['kyc', 'checkout'].includes(state.phase)) {
    const area = coverage(state.profile.pin, state.profile.city);
    const context = { ...state.profile, tier: area.tier, chosen: original.lines.map(row => row.id) };
    need(original.route === 'self' && original.lines.every(row => {
      const item = catalogue[row.id];
      return item && skuEligible(row.id, context) && row.price === item.price && row.setup === item.setup &&
        row.monthly === row.qty * item.price && row.oneTime === row.qty * item.setup;
    }), 'QUOTE_CHANGED', 409);
    return original;
  }
  const q = deriveQuote(state.profile, original.options);
  need((!purchasable || q.route === 'self') && q.version === original.version && q.monthly === original.monthly &&
    q.setup === original.setup && JSON.stringify(q.lines) === JSON.stringify(original.lines), 'QUOTE_CHANGED', 409);
  return q;
}

function evidencePolicy(state) {
  const fixture = state.fixture && publicSpecimen(state.fixture)?.required;
  return { id: true, address: true, gst: Boolean(fixture?.gst || state.profile.gstVerified || state.quote?.gstRequired),
    udyam: Boolean(fixture?.udyam) };
}

function present(state) {
  const { registrationHash, lastInbound, ...safe } = state;
  const p = state.profile;
  const draftQuote = state.phase === 'advisor' && p.type && p.sites && p.staff && (p.pin || p.city)
    ? deriveQuote({ ...p, budget: p.budget ?? 500000 }) : null;
  return {
    ...safe, draftQuote, nextQuestion: state.phase === 'advisor' ? nextQuestion(p) : null,
    priority: priority(state),
    hold: state.hold && { ...state.hold, expired: state.hold.expires <= Date.now() },
    evidencePolicy: evidencePolicy(state)
  };
}

function routeAssist(state, type) {
  state.assist = { type, state: 'queued', at: date() };
  addEvent(state, 'ASSISTANCE_QUEUED', 'Journey', { route: type });
}

async function apply(state, input, env) {
  switch (input.action) {
    case 'language':
      need(['en', 'hi'].includes(input.language), 'INVALID_LANGUAGE');
      state.language = input.language;
      break;
    case 'answer':
      await acceptAnswer(state, input.key, input.value);
      break;
    case 'intake':
      await addIntakeText(state, input.text, env);
      break;
    case 'edit':
      need(state.phase === 'quote' && !state.consent, 'WRONG_STEP', 409);
      state.phase = 'advisor';
      state.asked = 0;
      state.previousProfile = state.profile;
      state.profile = {};
      state.registrationHash = null;
      state.quote = null;
      if (state.scenario === 'custom') state.fixture = null;
      break;
    case 'toggle': {
      need(state.phase === 'quote', 'WRONG_STEP', 409);
      const old = currentQuote(state, input.revision, false);
      const key = input.key === 'backup' ? 'P09' : input.key === 'pos' ? 'P19' : input.key;
      const item = old.toggles.find(row => row.id === key);
      need(item && typeof input.enabled === 'boolean', 'SKU_INELIGIBLE');
      if (item.selected === input.enabled) break;
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
      const result = evaluateEvidence(evidencePolicy(state), input.documents);
      if (result.status === 'cleared' && (state.profile.gstVerified || state.quote?.gstRequired) &&
        (!state.registrationHash || await hash(readEvidenceGstin(input.documents)) !== state.registrationHash)) {
        result.status = 'correction';
        result.checks.push({ name: 'gst', state: 'correction', reason: 'GST_QUOTE_MISMATCH' });
      }
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
      const route = ['complex', 'survey', 'budget'].includes(state.quote?.route) ? state.quote.route : 'callback';
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

async function issueCode(db, row, state, actor = 'WhatsApp simulator') {
  need(!['closed'].includes(state.phase), 'WRONG_STEP', 409);
  const code = Array.from(crypto.getRandomValues(new Uint8Array(8)), byte => alphabet[byte % alphabet.length]).join('');
  const expires = Date.now() + 10 * MINUTE;
  addEvent(state, 'RESUME_ISSUED', actor);
  const result = await db.prepare('UPDATE cases SET state = ?, resume_hash = ?, resume_expires = ?, resume_tries = 0, revision = revision + 1, updated_at = ? WHERE id = ? AND revision = ?')
    .bind(JSON.stringify(state), await hash(row.id + code), expires, Date.now(), row.id, row.revision).run();
  need(result.meta.changes === 1, 'CASE_UPDATED', 409);
  return { state: present(state), code, expires };
}

async function receiveWhatsApp(env, event, deliver) {
  const db = env.DB;
  const now = Date.now();
  const { sender, message, appUrl } = event;
  const lease = random(12);
  await db.prepare('DELETE FROM whatsapp_deliveries WHERE delivered_at <= ?').bind(now - 7 * DAY).run();
  if (await db.prepare('SELECT message_hash FROM whatsapp_deliveries WHERE message_hash = ?').bind(message).first()) return;
  await db.prepare('DELETE FROM whatsapp_senders WHERE updated_at <= ? AND lease_until <= ?').bind(now - DAY, now).run();
  await db.prepare('INSERT OR IGNORE INTO whatsapp_senders (sender_hash, updated_at) VALUES (?, ?)').bind(sender, now).run();
  const lock = await db.prepare('UPDATE whatsapp_senders SET lease = ?, lease_until = ? WHERE sender_hash = ? AND lease_until <= ?')
    .bind(lease, now + MINUTE, sender, now).run();
  need(Number(lock.meta.changes) === 1, 'CASE_UPDATED', 409);
  try {
    if (await db.prepare('SELECT message_hash FROM whatsapp_deliveries WHERE message_hash = ?').bind(message).first()) return;
    const current = await db.prepare('SELECT case_id FROM whatsapp_senders WHERE sender_hash = ?').bind(sender).first();
    let row = current?.case_id && await db.prepare('SELECT * FROM cases WHERE id = ?').bind(current.case_id).first();
    let state = row && row.updated_at > now - authLifetime ? JSON.parse(row.state) : null;
    if (!state || state.phase === 'closed') {
      const started = await create(db, { channel: 'whatsapp', language: /\p{Script=Devanagari}/u.test(event.text) ? 'hi' : 'en' });
      row = await rowById(db, started.state.id);
      state = JSON.parse(row.state);
      await db.prepare('UPDATE whatsapp_senders SET case_id = ? WHERE sender_hash = ? AND lease = ?').bind(row.id, sender, lease).run();
    }
    if (state.phase === 'advisor' && !state.lastInbound?.includes(message)) {
      if (/\p{Script=Devanagari}/u.test(event.text)) state.language = 'hi';
      try { await addIntakeText(state, event.text, env); }
      catch (error) {
        if (!(error instanceof DomainError) || !['INVALID_MESSAGE', 'INTAKE_NOT_UNDERSTOOD'].includes(error.code)) throw error;
      }
      state.lastInbound = [...(state.lastInbound || []), message].slice(-32);
      need(await save(db, row, state), 'CASE_UPDATED', 409);
      row = await rowById(db, row.id);
    }
    const next = state.phase === 'advisor' ? nextQuestion(state.profile) : null;
    const handoff = next ? null : await issueCode(db, row, state, 'WhatsApp Cloud API');
    await deliver(waReply(state, next, appUrl, handoff?.code));
    await db.prepare('INSERT OR IGNORE INTO whatsapp_deliveries (message_hash, delivered_at) VALUES (?, ?)')
      .bind(message, Date.now()).run();
  } finally {
    await db.prepare('UPDATE whatsapp_senders SET lease = NULL, lease_until = 0, updated_at = ? WHERE sender_hash = ? AND lease = ?')
      .bind(Date.now(), sender, lease).run();
  }
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
  if (path === '/api/whatsapp/webhook') return handleWhatsApp(request, env, (event, deliver) => receiveWhatsApp(env, event, deliver));
  if (request.method === 'GET' && path === '/api/config') {
    return json({ clock, catalogueVersion, policyVersion, pins, slots,
      questions: questionOrder,
      fixtures: Object.entries(specimens).filter(([key]) => /^K\d\d$/.test(key)).map(([id, { description }]) => ({ id, description })),
      hostedAi: Boolean(modelProvider(env)) });
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
    const row = await authorize(db, request, id);
    const state = JSON.parse(row.state);
    if (state.phase === 'quote' && state.quote?.version === 'A26.07') {
      state.profile.gstStatus ??= 'none';
      state.quote = deriveQuote(state.profile, state.quote.options);
      state.quoteRevision += 1;
      need(await save(db, row, state), 'CASE_UPDATED', 409);
    }
    if (sub === 'specimen') {
      need(state.consent && state.phase === 'kyc', 'CONSENT_REQUIRED', 403);
      const sample = publicSpecimen(state.fixture || (evidencePolicy(state).gst ? 'D01' : 'D02'));
      return json({ ...sample, required: evidencePolicy(state) });
    }
    if (sub === 'explain') return json(await explainWithModel(state, env));
    return json({ state: present(state) });
  }
  need(request.method === 'POST' && !sub, 'NOT_FOUND', 404);
  const input = await readBody(request);
  if (input.action === 'pay') return json(await pay(db, request, id, input));
  const row = await authorize(db, request, id);
  const state = JSON.parse(row.state);
  if (input.action === 'issueCode') return json(await issueCode(db, row, state));
  await apply(state, input, env);
  need(await save(db, row, state), 'CASE_UPDATED', 409);
  return json({ state: present(state) });
}

export async function route(request, env, asset) {
  const url = new URL(request.url);
  try {
    if (url.pathname.startsWith('/specimens/')) {
      const id = request.headers.get('X-Case-Ref');
      need(env.DB && id && refPattern.test(id), 'AUTH_REQUIRED', 401);
      const state = JSON.parse((await authorize(env.DB, request, id)).state);
      const files = publicSpecimen(state.fixture)?.files || {};
      need(state.consent && state.phase === 'kyc' && Object.values(files).includes(url.pathname), 'PROOF_UNAVAILABLE', 403);
    }
    if (!url.pathname.startsWith('/api/')) return asset(url.pathname, request.method);
    return await handleApi(request, url, env);
  } catch (error) {
    if (error instanceof DomainError) return json({ error: error.code }, error.status);
    console.error('Journey service error', error?.name);
    return json({ error: 'SERVICE_ERROR' }, 500);
  }
}
