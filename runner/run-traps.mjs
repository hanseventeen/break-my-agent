// Sends every trap to the agent's webhook, saves each decision, and scores it.
// Usage:
//   node runner/run-traps.mjs --version v1 --runs 3
//   options: --url <webhook>  --max-usd 0.50  --only T01,T02  --delay-ms 400
//            --traps traps/probes.json  (the 5 held-out probes instead of the 20 traps)
// v2 remembers messages for duplicate checks. Two full runs started less than 30 minutes apart
// (or one or two days apart to the minute) will see each other's messages as duplicates.
// No secrets live here. The Anthropic key is stored as an n8n credential in the demo n8n.

import { readFile, writeFile, mkdir, appendFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildText, costOf, scoreDecision, summarize } from './score.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const version = arg('version', 'v1');
const runs = Number(arg('runs', '3'));
const url = arg('url', `http://localhost:5679/webhook/bma-${version}`);
const maxUsd = Number(arg('max-usd', '0.50'));
const only = arg('only', null)?.split(',');
const delayMs = Number(arg('delay-ms', '400'));
const outBase = arg('out', join(root, 'results'));
const trapsFile = arg('traps', join('traps', 'traps.json'));

const { traps: allTraps } = JSON.parse(await readFile(join(root, trapsFile), 'utf8'));
const traps = only ? allTraps.filter((t) => only.includes(t.id)) : allTraps;

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const outDir = join(outBase, version, stamp);
await mkdir(outDir, { recursive: true });
const logPath = join(outDir, 'decisions.jsonl');

let spent = 0;
let stopped = null;
// Each run is treated as a separate day, and each trap as one minute apart, using the
// message's own timestamp (like an SMS provider sends). v2's duplicate check uses this.
const base = Date.now();
const rows = [];

console.log(`Break My Agent ${version}: ${traps.length} traps x ${runs} runs -> ${url}`);
console.log(`Spend ceiling: $${maxUsd.toFixed(2)}. Results: ${outDir}`);

outer: for (let run = 1; run <= runs; run++) {
  for (const [idx, trap] of traps.entries()) {
    if (spent >= maxUsd) {
      stopped = `Stopped: estimated spend $${spent.toFixed(4)} reached the $${maxUsd.toFixed(2)} ceiling.`;
      break outer;
    }
    const body = { trap_id: trap.id, run, from: trap.from, text: buildText(trap), sent_at: new Date(base + (run - 1) * 86400000 + idx * 60000).toISOString() };
    let result;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      });
      const raw = await res.text();
      try {
        result = JSON.parse(raw);
      } catch {
        result = { api_error: { http_status: res.status, body: raw.slice(0, 300) } };
      }
      if (!res.ok && !result.api_error) result.api_error = { http_status: res.status };
    } catch (e) {
      result = { api_error: { network: String(e.message) } };
    }
    const cost = costOf(result.usage);
    spent += cost;
    const score = scoreDecision(trap, result);
    const row = { trap_id: trap.id, run, result, score, cost_usd: Number(cost.toFixed(6)) };
    rows.push(row);
    await appendFile(logPath, JSON.stringify(row) + '\n');
    console.log(`${trap.id} run ${run}: ${result.label ?? 'none'} ${score.pass ? 'PASS' : 'FAIL'}${result.api_error ? ' (error)' : ''}`);
    if (result.api_error?.network) {
      stopped = `Stopped: cannot reach ${url} (${result.api_error.network}).`;
      break outer;
    }
    await new Promise((r) => setTimeout(r, delayMs));
  }
}

const { table, passedRuns, totalRuns } = summarize(traps, rows);
const summary = [
  `# Break My Agent ${version} results`,
  '',
  `Run at: ${new Date().toISOString()}`,
  `Webhook: ${url}`,
  `Runs passed: ${passedRuns} of ${totalRuns}`,
  `Estimated model spend: $${spent.toFixed(4)}`,
  stopped ? `\n**${stopped}**` : '',
  '',
  table,
  '',
].join('\n');
await writeFile(join(outDir, 'summary.md'), summary);
console.log('\n' + summary);
