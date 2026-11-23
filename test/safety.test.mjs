// Checks on what ships in this repo: no credentials, fictional data only, and the
// workflow JSON is really built from the source files you can read.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildV1, buildV2 } from '../scripts/build-workflows.mjs';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SKIP = new Set(['.git', 'node_modules']);
function files(dir = ROOT) {
  return readdirSync(dir).flatMap((n) => {
    if (SKIP.has(n)) return [];
    const p = join(dir, n);
    return statSync(p).isDirectory() ? files(p) : [p];
  });
}
const text = (p) => readFileSync(p, 'utf8');
const all = files().filter((p) => /\.(js|mjs|json|jsonl|md|txt|yml|example)$/.test(p) || p.endsWith('.gitignore'));

test('the workflow JSON files match the source files (run: npm run build)', () => {
  assert.equal(text(join(ROOT, 'v1/workflow-v1.json')), JSON.stringify(buildV1(), null, 2));
  assert.equal(text(join(ROOT, 'v2/workflow-v2.json')), JSON.stringify(buildV2(), null, 2));
});

test('workflow JSON files carry no credentials', () => {
  for (const f of all.filter((p) => /workflow.*\.json$/.test(p))) {
    const wf = JSON.parse(text(f));
    for (const n of wf.nodes) assert.equal(n.credentials, undefined, `${relative(ROOT, f)}: ${n.name}`);
  }
});

test('no API keys or tokens anywhere', () => {
  const bad = [/sk-ant-[A-Za-z0-9_-]{8,}/, /\bBearer\s+[A-Za-z0-9._-]{16,}/, /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\./];
  for (const f of all) for (const re of bad) assert.doesNotMatch(text(f), re, relative(ROOT, f));
});

test('every phone number is a fictional 555 number', () => {
  for (const f of all) {
    for (const m of text(f).matchAll(/\b(\d{3})-(\d{4})\b/g)) {
      assert.equal(m[1], '555', `${relative(ROOT, f)}: ${m[0]}`);
    }
  }
});

test('every email address uses a reserved example domain', () => {
  for (const f of all) {
    for (const m of text(f).matchAll(/[\w.+-]+@([\w-]+\.[\w.-]+)/g)) {
      assert.match(m[1].replace(/\.+$/, ''), /^(example\.(com|org|net)|users\.noreply\.github\.com)$/, `${relative(ROOT, f)}: ${m[0]}`);
    }
  }
});

test('.env is git-ignored and .env.example holds no key', () => {
  assert.match(text(join(ROOT, '.gitignore')), /^\.env$/m);
  assert.doesNotMatch(text(join(ROOT, '.env.example')), /sk-|key\s*=/i);
});
