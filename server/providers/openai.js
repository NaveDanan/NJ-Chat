async function streamOpenAICompatible({ baseUrl, apiKey, model, messages, temperature = 0.7, maxTokens = 512, onDelta, onUsage }) {
  const url = baseUrl.replace(/\/$/, '') + '/v1/chat/completions';
  const headers = {
    'Content-Type': 'application/json',
  };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey}`;

  const body = {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream: true,
  };

  console.log('[DEBUG] Making request to:', url);
  console.log('[DEBUG] Request body:', JSON.stringify(body, null, 2));

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    let text = await res.text().catch(() => '');
    console.log('[DEBUG] Request failed:', res.status, text);
    throw new Error(`Upstream error ${res.status}: ${text}`);
  }

  console.log('[DEBUG] Response status:', res.status);
  console.log('[DEBUG] Response headers:', Object.fromEntries(res.headers.entries()));

  // Some servers may not use event-stream but send JSON chunks; handle both
  const ct = res.headers.get('content-type') || '';
  console.log('[DEBUG] Content-Type:', ct);
  const started = Date.now();
  let firstDeltaAt = 0;
  let charCount = 0;

  if (!ct.includes('event-stream') && !ct.includes('text/plain')) {
    console.log('[DEBUG] Non-streaming response detected');
    // Non-stream case
    const j = await res.json();
    console.log('[DEBUG] Non-stream response:', j);
    const content = j.choices?.[0]?.message?.content || '';
    if (content) onDelta && onDelta(content);
    const usage = j.usage || null;
    if (usage) onUsage && onUsage(usage);
    else if (content) {
      const est = Math.round(content.length / 4);
      onUsage && onUsage({ prompt_tokens: null, completion_tokens: est, total_tokens: est, tps_est: null, latency_ms: Date.now() - started });
    }
    return;
  }

  console.log('[DEBUG] Processing streaming response');

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  while (true) {
    const { value, done } = await reader.read();
    if (done) {
      console.log('[DEBUG] Stream reading completed');
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    // console.log('[DEBUG] Buffer chunk received, length:', value.length, 'total buffer length:', buffer.length);
    
    let idx;
    while ((idx = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, idx).trimEnd();
      buffer = buffer.slice(idx + 1);
      if (!line) continue;
      
      console.log('[DEBUG] Processing line:', line);
      
      if (line.startsWith('data:')) {
        const data = line.slice(5).trim();
        if (data === '[DONE]') {
          console.log('[DEBUG] Stream finished with [DONE]');
          // Stream finished; report metrics if possible
          const dur = Date.now() - started;
          if (onUsage) {
            const est = Math.round(charCount / 4);
            onUsage({ prompt_tokens: null, completion_tokens: est, total_tokens: est, tps_est: est > 0 && dur > 0 ? (est / (dur / 1000)) : null, ttfb_ms: firstDeltaAt ? firstDeltaAt - started : null, latency_ms: dur });
          }
          return;
        }
        try {
          const j = JSON.parse(data);
          // console.log('[DEBUG] Parsed JSON chunk:', j);
          const delta = j.choices?.[0]?.delta;
          if (delta?.content) {
            console.log('[DEBUG] Delta content:', delta.content);
            if (!firstDeltaAt) firstDeltaAt = Date.now();
            charCount += delta.content.length;
            onDelta && onDelta(delta.content);
          }
          if (j.usage) {
            console.log('[DEBUG] Usage info:', j.usage);
            onUsage && onUsage(j.usage);
          }
        } catch (_) {
          // ignore
        }
      }
    }
  }
}

module.exports = { streamOpenAICompatible };
