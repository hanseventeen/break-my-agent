// Runs the real n8n Code node source offline. n8n gives Code nodes three helpers:
// $input (this node's input), $getWorkflowStaticData (memory kept between runs),
// and $('Node name') (another node's output). This file fakes those three, so the
// exact code that ships in the workflow JSON can be tested with no n8n and no network.
import { readFileSync } from 'node:fs';
import { buildV1, buildV2 } from '../scripts/build-workflows.mjs';
import { buildText } from '../runner/score.mjs';

const codeOf = (wf, name) => wf.nodes.find((n) => n.name === name).parameters.jsCode;
export const V1 = buildV1();
export const V2 = buildV2();

export function runCode(code, { json, staticData = {}, refs = {} }) {
  const fn = new Function('$input', '$getWorkflowStaticData', '$', code);
  const out = fn(
    { first: () => ({ json }) },
    () => staticData,
    (name) => ({ first: () => ({ json: refs[name] }) }),
  );
  return out[0].json;
}

export function rulesBefore(body, staticData = {}) {
  return runCode(codeOf(V2, 'Rules before model'), { json: { body }, staticData });
}

// A fake Anthropic reply. `text` is what the "model" says.
export const modelReply = (text, extra = {}) => ({
  content: [{ type: 'text', text }],
  usage: { input_tokens: 500, output_tokens: 40 },
  ...extra,
});

export function rulesAfter(before, reply) {
  return runCode(codeOf(V2, 'Rules after model'), {
    json: before.skip_model ? before : reply,
    refs: { 'Rules before model': before },
  });
}

// The whole v2 chain: rules, then the fake model (only if the rules don't skip it), then rules.
export function runV2(body, fakeModel, staticData = {}) {
  const before = rulesBefore(body, staticData);
  const reply = before.skip_model ? null : fakeModel(before, body);
  return { before, after: rulesAfter(before, reply) };
}

export function v1Request(body) {
  return runCode(codeOf(V1, 'Build request'), { json: { body } });
}
export function v1Read(request, reply) {
  return runCode(codeOf(V1, 'Read decision'), { json: reply, refs: { 'Build request': request } });
}

const root = new URL('..', import.meta.url);
export const traps = JSON.parse(readFileSync(new URL('traps/traps.json', root), 'utf8')).traps;
export const probes = JSON.parse(readFileSync(new URL('traps/probes.json', root), 'utf8')).traps;

// Same message body the runner sends: one simulated day per run, one minute per trap.
export function bodyFor(trap, idx, run = 1, base = Date.UTC(2026, 10, 22, 9, 0)) {
  return {
    trap_id: trap.id,
    run,
    from: trap.from,
    text: buildText(trap),
    sent_at: new Date(base + (run - 1) * 86400000 + idx * 60000).toISOString(),
  };
}
