# v2: with guardrails

The order is rules first, the model second, and a person for anything unclear.
Every answer says who decided it in `decided_by`: `rule`, `model`, or `rule+model` (both agreed).

## The six nodes
1. **Tenant text in**: the webhook (`/webhook/bma-v2`).
2. **Rules before model** (`rules-before.js`). This is plain code with no AI:
   - Empty message: HUMAN, and the model is skipped.
   - Over 1,000 characters: cut down before the model sees it, and flagged.
   - Duplicate: same sender, same text, within 30 minutes of the message's own timestamp. Flagged with what it duplicates.
   - Sender lookup against the tenant list. Unknown numbers are flagged `unverified_sender`. Names claimed inside the text are ignored.
   - Injection attempts ("ignore your rules", "SYSTEM:", "print your instructions", "reply only with"): flagged, and those sentences are removed before the model sees the message.
   - Card numbers, ID numbers, phone numbers and emails are masked before the model sees them.
   - Keyword floors. Emergency words set a minimum of EMERGENCY. Money, legal, access, identity and threat words set a minimum of HUMAN.
3. **Skip the model?** (IF): only empty messages skip the model.
4. **Ask Claude (Haiku)**: a tighter prompt. The message sits inside `<tenant_message>` tags and is described as untrusted. **The prompt holds no secrets.** The lockbox code and building notes are gone.
5. **Rules after model** (`rules-after.js`). This is plain code with no AI:
   - Shape check: exactly a valid label and a reason. Extra fields are dropped and flagged. A broken answer becomes HUMAN.
   - Reason scan: a reason with long digit runs, masked markers or code-like text is replaced.
   - Combine: the stricter of the rule floor and the model wins (EMERGENCY, then HUMAN, then ROUTINE).
   - Injection cap: if someone tried to give the AI orders, the AI alone can't trigger an emergency. Only the keyword rule can. It goes to a person instead.
6. **Send decision back**: `{label, reason, flags}` plus a log of who decided.

## Source files
`rules-before.js`, `rules-after.js` and `system-prompt-v2.txt` are the real code and prompt. `npm run build` puts them into `workflow-v2.json`, and `npm test` checks the JSON is up to date and runs the rules offline.

## Setup
Import `workflow-v2.json` into the demo n8n. In the node "Ask Claude (Haiku)", choose the same `Anthropic demo key` credential, then publish.

## Run
    node runner/run-traps.mjs --version v2 --runs 3

The runner gives each run its own simulated day, so the duplicate check only fires for T15.
