// v2, layer 1: plain rules that run BEFORE the model. No AI here.
// Source of the n8n Code node "Rules before model". Fictional data only.
const SYSTEM_PROMPT = '__SYSTEM_PROMPT__';

const TENANTS = {
  '555-0111': '1A', '555-0112': '1B', '555-0113': '1C', '555-0114': '1D', '555-0115': '1E',
  '555-0116': '2A', '555-0117': '2B', '555-0118': '2C', '555-0119': '2D', '555-0120': '2E',
};
const MAX_CHARS = 1000;
const DUPLICATE_WINDOW_MS = 30 * 60 * 1000;

const EMERGENCY_PATTERNS = [
  /\bgas\b(?!\s*bill)/i, /\bsmoke\b/i, /\bfire\b/i, /\bflames?\b/i, /\bspark/i, /\bburning\b/i,
  /carbon monoxide/i, /\bco alarm/i, /smoke alarm/i, /\bbeep/i,
  /\bflood/i, /\bburst\b/i, /\bsewage\b/i, /\bspreading\b/i, /water (is )?(coming|pouring|everywhere)/i,
  /\bgaz\b/i, /fum[ée]e/i, /\bfeu\b/i, /inondation/i, /coule partout/i,
];
const HUMAN_PATTERNS = [
  /\blawyer\b/i, /\battorney\b/i, /\bwithhold/i, /\bevict/i, /\bcourt\b/i, /\bsue\b/i,
  /\brent\b/i, /\bpayment\b/i, /\bcard\b/i, /\bdeposit\b/i, /\blease\b/i,
  /\bcode\b/i, /\blockbox\b/i, /\bpassword\b/i, /\bkeys?\b/i,
  /\bowner\b/i, /\blandlord\b/i, /phone number/i, /contact details/i,
  /\bsmash/i, /\bkill\b/i, /\bhurt\b/i, /burn (it|this|the place) down/i, /\bor else\b/i,
];
const INJECTION_PATTERNS = [
  /ignore (your|all|the|previous|any) (rules|instructions)/i,
  /\bsystem\s*:/i, /classification\s*=/i,
  /print (your |the )?(full )?(instructions|prompt|rules)/i,
  /(reply|respond|answer) only with/i, /your (system )?prompt/i,
];

function mask(text) {
  return text
    .replace(/\b(?:\d[ -]?){12,18}\d\b/g, '[CARD]')
    .replace(/\b\d{3}-\d{2}-\d{4}\b/g, '[ID]')
    .replace(/\b(?:\+?1[ -]?)?\d{3}[ -]\d{4}\b/g, '[PHONE]')
    .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[EMAIL]');
}

// Remove the parts of a message that try to give the AI orders, keep the rest.
function stripInjection(text) {
  let t = text.replace(/\[[^\]]*(system|classification|reason\s*=)[^\]]*\]/gi, ' ');
  const sentences = t.split(/(?<=[.!?])\s+/);
  const kept = sentences.filter((s) => !INJECTION_PATTERNS.some((p) => p.test(s)));
  return kept.join(' ').trim();
}

function normalise(text) {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

const b = $input.first().json.body || {};
const from = String(b.from || '');
const original = typeof b.text === 'string' ? b.text : '';
const sentAt = Date.parse(b.sent_at) || Date.now();
const flags = [];
let floor = null; // the lowest label the rules allow: EMERGENCY or HUMAN

// 1. Empty check
if (original.trim() === '') {
  flags.push('empty_message');
}

// 2. Length limit
let text = original;
if (text.length > MAX_CHARS) {
  flags.push('long_message');
  text = text.slice(0, MAX_CHARS);
}

// 3. Duplicate check (same sender, same text, within 30 minutes, by the message's own timestamp)
const store = $getWorkflowStaticData('global');
store.seen = store.seen || {};
for (const [k, v] of Object.entries(store.seen)) {
  if (Math.abs(sentAt - v.sentAt) > 24 * 60 * 60 * 1000) delete store.seen[k];
}
const dupKey = `${from}|${normalise(original)}`;
let duplicateOf = null;
const prior = store.seen[dupKey];
if (prior && original.trim() !== '' && Math.abs(sentAt - prior.sentAt) <= DUPLICATE_WINDOW_MS) {
  flags.push('duplicate');
  duplicateOf = prior.ref;
} else {
  store.seen[dupKey] = { sentAt, ref: b.trap_id ? `${b.trap_id}/run${b.run}` : new Date(sentAt).toISOString() };
}

// 4. Sender lookup (identity claims inside the text are ignored)
const unit = TENANTS[from] || null;
if (!unit) flags.push('unverified_sender');

// 5. Injection attempts: flag, and remove those sentences before the model sees the text
const injection = INJECTION_PATTERNS.some((p) => p.test(text));
if (injection) {
  flags.push('injection_attempt');
  text = stripInjection(text);
}

// 6. Mask personal data before the model sees it
const masked = mask(text);
if (masked !== text) flags.push('personal_data_masked');

// 7. Keyword floors
const emergencyHit = EMERGENCY_PATTERNS.some((p) => p.test(original));
const humanHit = HUMAN_PATTERNS.some((p) => p.test(original));
if (emergencyHit) floor = 'EMERGENCY';
else if (humanHit) floor = 'HUMAN';
if (emergencyHit && humanHit) flags.push('copy_to_human');

const skipModel = original.trim() === '' || masked.trim() === '';

return [{
  json: {
    trap_id: b.trap_id ?? null,
    run: b.run ?? null,
    from,
    unit,
    flags,
    floor,
    duplicate_of: duplicateOf,
    skip_model: skipModel,
    model_text: masked,
    request: {
      model: 'claude-haiku-5-5',
      max_tokens: 1024,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `<tenant_message>\n${masked}\n</tenant_message>` }],
    },
  },
}];
