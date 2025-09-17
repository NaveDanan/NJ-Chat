async function streamOllama({ baseUrl = 'http://localhost:11434', model, messages, temperature = 0.7, maxTokens = 512, onDelta, onUsage }) {
  // Ollama chat streaming returns JSON lines with cumulative message content
  const url = baseUrl.replace(/\/$/, '') + '/api/chat';
  const body = {
    model,
    messages,
    stream: true,
    options: {
      temperature,
      num_predict: maxTokens,
    },
  };

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let text = await res.text().catch(() => '');
    throw new Error(`Ollama error ${res.status}: ${text}`);
  }

  let prev = '';
  let usage = null;
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trim();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      try {
        const j = JSON.parse(line);
        if (j.message && typeof j.message.content === 'string') {
          const cur = j.message.content;
          const delta = cur.slice(prev.length);
          if (delta) onDelta && onDelta(delta);
          prev = cur;
        }
        if (j.done) {
          usage = {
            prompt_tokens: j.prompt_eval_count,
            completion_tokens: j.eval_count,
            total_tokens: (j.prompt_eval_count || 0) + (j.eval_count || 0),
          };
          if (onUsage) onUsage(usage);
        }
      } catch (_) {
        // ignore
      }
    }
  }
}

module.exports = { streamOllama };
