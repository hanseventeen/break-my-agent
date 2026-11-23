// Builds v1/workflow-v1.json and v2/workflow-v2.json from the source files next to them.
// The Code node source lives in plain .js files so it can be read, reviewed and tested
// offline. The system prompt is pasted in where the code says '__SYSTEM_PROMPT__'.
// No credentials are written: you pick the Anthropic credential in n8n after import.
// Usage: node scripts/build-workflows.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = (p) => readFileSync(join(ROOT, p), 'utf8');

export function withPrompt(code, promptPath) {
  const prompt = read(promptPath).trim();
  return code.replace("'__SYSTEM_PROMPT__'", () => JSON.stringify(prompt));
}

const askClaude = (position) => ({
  parameters: {
    method: 'POST',
    url: 'https://api.anthropic.com/v1/messages',
    authentication: 'genericCredentialType',
    genericAuthType: 'httpHeaderAuth',
    sendHeaders: true,
    headerParameters: {
      parameters: [
        { name: 'anthropic-version', value: '2023-06-01' },
        { name: 'content-type', value: 'application/json' },
      ],
    },
    sendBody: true,
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify($json.request) }}',
    options: { response: { response: { neverError: true } }, timeout: 60000 },
  },
  name: 'Ask Claude (Haiku)',
  type: 'n8n-nodes-base.httpRequest',
  typeVersion: 4.2,
  position,
});
const webhook = (path, id) => ({
  parameters: { httpMethod: 'POST', path, responseMode: 'responseNode', options: {} },
  name: 'Tenant text in',
  type: 'n8n-nodes-base.webhook',
  typeVersion: 2,
  position: [0, 0],
  webhookId: id,
});
const code = (name, jsCode, position) => ({
  parameters: { jsCode },
  name,
  type: 'n8n-nodes-base.code',
  typeVersion: 2,
  position,
});
const respond = (position) => ({
  parameters: { respondWith: 'firstIncomingItem', options: {} },
  name: 'Send decision back',
  type: 'n8n-nodes-base.respondToWebhook',
  typeVersion: 1.1,
  position,
});
const link = (node) => ({ main: [[{ node, type: 'main', index: 0 }]] });
const settings = { executionOrder: 'v1', saveDataSuccessExecution: 'all', saveDataErrorExecution: 'all' };

export function buildV1() {
  return {
    name: 'Break My Agent v1 (AI only)',
    nodes: [
      webhook('bma-v1', 'b7a1c2d3-0000-4000-8000-00000000b001'),
      code('Build request', withPrompt(read('v1/build-request.js'), 'v1/system-prompt-v1.txt'), [240, 0]),
      askClaude([480, 0]),
      code('Read decision', read('v1/read-decision.js'), [720, 0]),
      respond([960, 0]),
    ],
    connections: {
      'Tenant text in': link('Build request'),
      'Build request': link('Ask Claude (Haiku)'),
      'Ask Claude (Haiku)': link('Read decision'),
      'Read decision': link('Send decision back'),
    },
    settings,
    pinData: {},
  };
}

export function buildV2() {
  return {
    name: 'Break My Agent v2 (guardrails)',
    nodes: [
      webhook('bma-v2', 'b7a1c2d3-0000-4000-8000-00000000b002'),
      code('Rules before model', withPrompt(read('v2/rules-before.js'), 'v2/system-prompt-v2.txt'), [240, 0]),
      {
        parameters: {
          conditions: {
            options: { caseSensitive: true, leftValue: '', typeValidation: 'strict' },
            conditions: [
              {
                id: 'a1b2c3d4-0000-4000-8000-0000000000c1',
                leftValue: '={{ $json.skip_model }}',
                rightValue: '',
                operator: { type: 'boolean', operation: 'true', singleValue: true },
              },
            ],
            combinator: 'and',
          },
          options: {},
        },
        name: 'Skip the model?',
        type: 'n8n-nodes-base.if',
        typeVersion: 2,
        position: [480, 0],
      },
      askClaude([720, 100]),
      code('Rules after model', read('v2/rules-after.js'), [960, 0]),
      respond([1200, 0]),
    ],
    connections: {
      'Tenant text in': link('Rules before model'),
      'Rules before model': link('Skip the model?'),
      'Skip the model?': {
        main: [
          [{ node: 'Rules after model', type: 'main', index: 0 }],
          [{ node: 'Ask Claude (Haiku)', type: 'main', index: 0 }],
        ],
      },
      'Ask Claude (Haiku)': link('Rules after model'),
      'Rules after model': link('Send decision back'),
    },
    settings,
    pinData: {},
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  writeFileSync(join(ROOT, 'v1/workflow-v1.json'), JSON.stringify(buildV1(), null, 2));
  writeFileSync(join(ROOT, 'v2/workflow-v2.json'), JSON.stringify(buildV2(), null, 2));
  console.log('wrote v1/workflow-v1.json and v2/workflow-v2.json');
}
