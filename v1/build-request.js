// v1: AI only. No checks before or after the model.
const SYSTEM_PROMPT = '__SYSTEM_PROMPT__';
const b = $input.first().json.body || {};
return [{ json: {
  trap_id: b.trap_id ?? null,
  run: b.run ?? null,
  from: b.from ?? '',
  text: b.text ?? '',
  request: {
    model: 'claude-haiku-5-5',
    max_tokens: 1024,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Message from ${b.from || 'unknown'}:\n${b.text ?? ''}` }],
  },
} }];
