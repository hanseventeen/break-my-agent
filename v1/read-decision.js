// v1 trusts whatever JSON the model returns (on purpose: trap T18 tests this).
const req = $('Build request').first().json;
const res = $input.first().json;
const text = (res.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
let decision = null, parse_error = null;
try {
  const m = text.match(/\{[\s\S]*\}/);
  decision = JSON.parse(m ? m[0] : text);
} catch (e) { parse_error = String(e.message); }
return [{ json: {
  version: 'v1',
  trap_id: req.trap_id,
  run: req.run,
  decided_by: 'model',
  decision,
  label: decision?.label ?? null,
  reason: decision?.reason ?? null,
  flags: Array.isArray(decision?.flags) ? decision.flags : [],
  raw_text: text,
  parse_error,
  api_error: res.error ?? null,
  stop_reason: res.stop_reason ?? null,
  model: res.model ?? null,
  usage: res.usage ?? null,
  at: new Date().toISOString(),
} }];
