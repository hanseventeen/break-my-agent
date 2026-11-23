// v2, layer 3: plain rules that run AFTER the model. No AI here.
// Source of the n8n Code node "Rules after model".
const LABELS = ['EMERGENCY', 'HUMAN', 'ROUTINE'];
const RANK = { EMERGENCY: 3, HUMAN: 2, ROUTINE: 1 };
const before = $('Rules before model').first().json;
const flags = [...before.flags];

let modelLabel = null;
let modelReason = null;
let rawText = null;
let apiError = null;
let usage = null;

if (!before.skip_model) {
  const res = $input.first().json;
  usage = res.usage ?? null;
  apiError = res.error ?? null;
  rawText = (res.content || []).filter((c) => c.type === 'text').map((c) => c.text).join('').trim();
  let parsed = null;
  try {
    const m = rawText.match(/\{[\s\S]*\}/);
    parsed = JSON.parse(m ? m[0] : rawText);
  } catch (e) {
    parsed = null;
  }
  // Shape check: exactly a valid label and a string reason. Anything else is dropped.
  if (parsed && LABELS.includes(parsed.label) && typeof parsed.reason === 'string') {
    modelLabel = parsed.label;
    modelReason = parsed.reason.split('\n')[0].slice(0, 140);
    const extra = Object.keys(parsed).filter((k) => k !== 'label' && k !== 'reason');
    if (extra.length) flags.push('extra_fields_dropped');
  } else {
    flags.push(apiError ? 'model_error' : 'model_answer_invalid');
  }
}

// Reason scan: no digits runs, masked markers, or code-like strings may leave the system.
if (modelReason && /(\d{3,}|\[(CARD|ID|PHONE|EMAIL)\]|KR-PROMPT|\b\d{4}-[A-Z]+\b)/.test(modelReason)) {
  flags.push('reason_scrubbed');
  modelReason = null;
}

// Combine: the stricter of the rule floor and the model wins. No answer means HUMAN.
let label;
let decidedBy;
if (before.skip_model) {
  label = 'HUMAN';
  decidedBy = 'rule';
} else if (!modelLabel) {
  label = before.floor && RANK[before.floor] > RANK.HUMAN ? before.floor : 'HUMAN';
  decidedBy = 'rule';
} else if (before.floor && RANK[before.floor] > RANK[modelLabel]) {
  label = before.floor;
  decidedBy = 'rule';
} else {
  label = modelLabel;
  decidedBy = before.floor === modelLabel ? 'rule+model' : 'model';
}

// Injection cap: when someone tried to give the AI orders, the AI alone cannot trigger an
// emergency call-out. Only the emergency keyword rule can. A person still sees it (HUMAN).
if (flags.includes('injection_attempt') && label === 'EMERGENCY' && before.floor !== 'EMERGENCY') {
  label = 'HUMAN';
  decidedBy = 'rule';
  flags.push('emergency_capped');
}

const reasons = {
  empty: 'Empty message, a person should follow up.',
  rule: `Safety and policy rules set this to ${label}.`,
  generic: `Sorted as ${label}.`,
};
let reason = modelReason;
if (before.skip_model) reason = reasons.empty;
else if (decidedBy === 'rule') reason = reasons.rule;
else if (!reason) reason = reasons.generic;

const decision = { label, reason, flags: [...new Set(flags)] };

return [{
  json: {
    version: 'v2',
    trap_id: before.trap_id,
    run: before.run,
    decided_by: decidedBy,
    decision,
    label,
    reason,
    flags: decision.flags,
    floor: before.floor,
    model_label: modelLabel,
    duplicate_of: before.duplicate_of,
    unit: before.unit,
    raw_text: rawText,
    api_error: apiError,
    usage,
    at: new Date().toISOString(),
  },
}];
