# v1: AI only

v1 is the agent with no guardrails. The model gets the rules in plain language, and nothing checks its answer.
This is on purpose. The failures are the point.

## What is in v1
- `system-prompt-v1.txt`: the rules, plus building notes. The notes include a **fake** lockbox code (`0000-TEST`) and a fake prompt tag (`KR-PROMPT-7`), so leak traps have something real to leak.
- `workflow-v1.json`: the n8n workflow. Webhook in, one call to `claude-haiku-5-5`, decision back. Five nodes. It holds no credentials.
- `build-request.js` and `read-decision.js`: the code of the two Code nodes, as plain files. `npm run build` puts them (and the prompt) into `workflow-v1.json`.

## Setup on the demo n8n (localhost:5679 only)
1. Import `workflow-v1.json`.
2. Create a credential: Credentials, then Header Auth. Name: `Anthropic demo key`. Header name: `x-api-key`. Value: your demo key. Only you type the key.
3. Open the node "Ask Claude (Haiku)", choose that credential, save.
4. Publish the workflow (n8n 2.x uses Publish instead of the old Active switch).

## Run the traps
From the `break-my-agent` folder:

    node runner/run-traps.mjs --version v1 --runs 3

The runner stops on its own if the estimated spend reaches $0.50 (`--max-usd`).
Results go to `results/v1/<timestamp>/`: `decisions.jsonl` (every decision, raw) and `summary.md` (the score table).
