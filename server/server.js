const http = require('http');
const path = require('path');
const fs = require('fs');
const { URL } = require('url');
const crypto = require('crypto');
const db = require('./storage');
const auth = require('./util/auth');
const { streamOpenAICompatible } = require('./providers/openai');
const { streamOllama } = require('./providers/ollama');
const { generateChatTitle } = require('./title-generator');

const PUBLIC_DIR = path.join(__dirname, '..', 'public');
const DATA_DIR = path.join(__dirname, '..', 'data');
if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// Helpers
function send(res, status, data, headers = {}) {
  const body = typeof data === 'string' ? data : JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': typeof data === 'string' ? 'text/plain; charset=utf-8' : 'application/json',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

function parseJson(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', (chunk) => {
      data += chunk;
      if (data.length > 10 * 1024 * 1024) {
        reject(new Error('Payload too large'));
        req.destroy();
      }
    });
    req.on('end', () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch (e) {
        reject(e);
      }
    });
    req.on('error', reject);
  });
}

function getAuthToken(req) {
  // Prefer Authorization header, else cookie `njchat_session`
  const authz = req.headers['authorization'];
  if (authz && authz.startsWith('Bearer ')) return authz.slice('Bearer '.length);
  const cookie = req.headers['cookie'] || '';
  const match = cookie.match(/(?:^|; )njchat_session=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

function setSessionCookie(res, token, maxAgeSeconds) {
  const parts = [
    `njchat_session=${encodeURIComponent(token)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
    `Max-Age=${maxAgeSeconds}`,
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

async function fetchProviderModels({ provider, baseUrl, apiKey }) {
  const p = (provider || 'openai').toLowerCase();
  const urlBase = (baseUrl || (p === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234')).replace(/\/$/, '');
  if (p === 'ollama') {
    const res = await fetch(urlBase + '/api/tags');
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`Failed to fetch models from Ollama (${res.status}): ${text}`);
    }
    const json = await res.json();
    return (json.models || []).map((m) => ({ id: m.name }));
  }
  const headers = { 'Authorization': `Bearer ${apiKey || 'lm-studio'}` };
  const res = await fetch(urlBase + '/v1/models', { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`Failed to fetch models (${res.status}): ${text}`);
  }
  const json = await res.json();
  if (Array.isArray(json.data)) {
    return json.data.map((m) => ({ id: m.id || m.name || '' })).filter((m) => m.id);
  }
  return [];
}

const pendingTitleJobs = new Map();

function scheduleTitleGeneration({ userId, chatId, provider, baseUrl, apiKey, model }) {
  const key = `${userId}:${chatId}`;
  if (!userId || !chatId) return;
  if (pendingTitleJobs.has(key)) return;
  const job = (async () => {
    try {
      const chat = db.getChat(userId, chatId);
      if (!chat) return;
      const currentTitle = chat.title || '';
      if (currentTitle && currentTitle !== 'New Chat') return;
      const history = Array.isArray(chat.messages) ? chat.messages : [];
      if (!history.some((msg) => msg?.role === 'user' && typeof msg.content === 'string' && msg.content.trim())) {
        return;
      }
      const title = await generateChatTitle({
        provider,
        baseUrl,
        apiKey,
        model: model || chat.model || '',
        messages: history,
      });
      if (title && title !== currentTitle) {
        db.updateChatMeta(userId, chatId, { title });
      } else if (!currentTitle || currentTitle === 'New Chat') {
        db.ensureChatTitle(userId, chatId);
      }
    } catch (err) {
      console.warn('[server] title generation failed:', err?.message || err);
      try { db.ensureChatTitle(userId, chatId); } catch (_) {}
    }
  })().finally(() => pendingTitleJobs.delete(key));
  pendingTitleJobs.set(key, job);
}

function ensureUser(req) {
  const token = getAuthToken(req);
  if (!token) return null;
  try {
    const payload = auth.verifyJWT(token);
    return db.getUserById(payload.sub) || null;
  } catch (e) {
    return null;
  }
}

// Static file server (very simple)
function serveStatic(req, res, url) {
  let pathname = url.pathname;
  if (pathname === '/') pathname = '/index.html';
  const filePath = path.normalize(path.join(PUBLIC_DIR, pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    return send(res, 403, 'Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') return send(res, 404, 'Not found');
      return send(res, 500, 'Server error');
    }
    const ext = path.extname(filePath).toLowerCase();
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8',
      '.svg': 'image/svg+xml',
      '.png': 'image/png',
      '.ico': 'image/x-icon',
    };
    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    res.end(content);
  });
}

function sseWrite(res, event, data) {
  console.log('[DEBUG] SSE Write:', event, JSON.stringify(data).substring(0, 100) + (JSON.stringify(data).length > 100 ? '...' : ''));
  res.write(`event: ${event}
`);
  res.write(`data: ${JSON.stringify(data)}

`);
}

function sseInit(req, res) {
  const origin = req.headers.origin || '*';
  // For credentials, origin must be explicit, not '*'
  const allowOrigin = origin === '*' ? '*' : origin;
  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    'Connection': 'keep-alive',
    'X-Accel-Buffering': 'no',
    'Access-Control-Allow-Origin': allowOrigin,
    'Access-Control-Allow-Credentials': 'true',
    'Vary': 'Origin',
  });
  res.write(': connected\\n\\n');
}

async function handleApi(req, res, url) {
  const method = req.method || 'GET';
  const pathname = url.pathname;

  // CORS preflight (only if accessed cross-origin)
  if (method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type,Authorization',
      'Vary': 'Origin',
    });
    return res.end();
  }

  // Helper to set CORS headers on API responses
  function withCorsHeaders(extra = {}) {
    return {
      'Access-Control-Allow-Origin': req.headers.origin || '*',
      'Access-Control-Allow-Credentials': 'true',
      'Vary': 'Origin',
      ...extra,
    };
  }

  try {
    // Auth routes
    if (method === 'POST' && pathname === '/api/auth/register') {
      const body = await parseJson(req);
      const { email, password } = body || {};
      if (!email || !password || password.length < 6) {
        return send(res, 400, { error: 'Invalid email or password' }, withCorsHeaders());
      }
      if (db.getUserByEmail(email)) {
        return send(res, 409, { error: 'Email already registered' }, withCorsHeaders());
      }
      const salt = crypto.randomBytes(16).toString('hex');
      const hash = auth.hashPassword(password, salt);
      const user = db.createUser({ email, passwordHash: hash, salt });
      const token = auth.createJWT({ sub: user.id, email: user.email });
      setSessionCookie(res, token, 60 * 60 * 24 * 30);
      return send(res, 201, { user: { id: user.id, email: user.email }, settings: user.settings }, withCorsHeaders());
    }

    if (method === 'POST' && pathname === '/api/auth/login') {
      const body = await parseJson(req);
      const { email, password } = body || {};
      const user = db.getUserByEmail(email || '');
      if (!user) return send(res, 401, { error: 'Invalid credentials' }, withCorsHeaders());
      const hash = auth.hashPassword(password || '', user.salt);
      if (hash !== user.passwordHash) return send(res, 401, { error: 'Invalid credentials' }, withCorsHeaders());
      const token = auth.createJWT({ sub: user.id, email: user.email });
      setSessionCookie(res, token, 60 * 60 * 24 * 30);
      return send(res, 200, { user: { id: user.id, email: user.email }, settings: user.settings }, withCorsHeaders());
    }

    if (method === 'POST' && pathname === '/api/auth/logout') {
      setSessionCookie(res, 'expired', 0);
      return send(res, 200, { ok: true }, withCorsHeaders());
    }

    if (method === 'GET' && pathname === '/api/me') {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      return send(res, 200, { user: { id: user.id, email: user.email }, settings: user.settings }, withCorsHeaders());
    }

    // Settings
    if (method === 'POST' && pathname === '/api/settings') {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const body = await parseJson(req);
      const updated = db.updateUserSettings(user.id, body || {});
      return send(res, 200, { settings: updated }, withCorsHeaders());
    }

    // Models listing based on provider
    if (method === 'GET' && pathname === '/api/models') {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      try {
        const settings = user.settings || {};
        const models = await fetchProviderModels({ provider: settings.provider, baseUrl: settings.baseUrl, apiKey: settings.apiKey });
        return send(res, 200, { models }, withCorsHeaders());
      } catch (e) {
        return send(res, 502, { error: String(e.message || e) }, withCorsHeaders());
      }
    }

    if (method === 'POST' && pathname === '/api/models/test') {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      try {
        const body = await parseJson(req);
        const models = await fetchProviderModels({ provider: body?.provider || user.settings?.provider, baseUrl: body?.baseUrl || user.settings?.baseUrl, apiKey: body?.apiKey || user.settings?.apiKey });
        return send(res, 200, { models }, withCorsHeaders());
      } catch (e) {
        return send(res, 502, { error: String(e.message || e) }, withCorsHeaders());
      }
    }
    // Chats
    if (method === 'GET' && pathname === '/api/chats') {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const chats = db.listChats(user.id);
      return send(res, 200, { chats }, withCorsHeaders());
    }

    if (method === 'POST' && pathname === '/api/chats') {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const body = await parseJson(req);
      const chat = db.createChat(user.id, {
        title: body.title || 'New Chat',
        model: body.model || (user.settings?.model || ''),
        system: body.system || '',
        folder: body.folder || '',
        pinned: !!body.pinned,
      });
      return send(res, 201, { chat }, withCorsHeaders());
    }

    if (method === 'GET' && pathname.startsWith('/api/chats/')) {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const id = pathname.split('/').pop();
      const chat = db.getChat(user.id, id);
      if (!chat) return send(res, 404, { error: 'Not found' }, withCorsHeaders());
      return send(res, 200, { chat }, withCorsHeaders());
    }

    // Update chat meta
    if (method === 'PATCH' && pathname.startsWith('/api/chats/')) {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const id = pathname.split('/')[3] || pathname.split('/').pop();
      const body = await parseJson(req);
      try {
        const chat = db.updateChatMeta(user.id, id, { title: body.title, model: body.model, system: body.system, folder: body.folder, pinned: body.pinned });
        return send(res, 200, { chat }, withCorsHeaders());
      } catch (e) {
        return send(res, 404, { error: 'Not found' }, withCorsHeaders());
      }
    }

    if (method === 'DELETE' && pathname.startsWith('/api/chats/')) {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const id = pathname.split('/').pop();
      const ok = db.deleteChat(user.id, id);
      return send(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Not found' }, withCorsHeaders());
    }

    // Send a message and stream response
    if (method === 'POST' && pathname.startsWith('/api/chats/') && pathname.endsWith('/messages')) {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const id = pathname.split('/')[3];
      const chat = db.getChat(user.id, id);
      if (!chat) return send(res, 404, { error: 'Not found' }, withCorsHeaders());
      const body = await parseJson(req);
      const content = (body && body.content) || '';
      if (!content) return send(res, 400, { error: 'No content' }, withCorsHeaders());
      const settings = user.settings || {};
      const model = body.model || chat.model || settings.model || '';
      const temperature = body.temperature ?? settings.temperature ?? 0.7;
      const maxTokens = body.max_tokens ?? settings.max_tokens ?? 512;
      const contextMessages = db.getMessages(user.id, id);

      // Save user message immediately
      const userMsg = db.appendMessage(user.id, id, {
        role: 'user',
        content,
      });

      // Start SSE (with CORS)
      sseInit(req, res);
      sseWrite(res, 'ack', { messageId: userMsg.id });

      const provider = (settings.provider || 'openai').toLowerCase();
      const baseUrl = settings.baseUrl || (provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234');
      const apiKey = settings.apiKey || (provider === 'openai' ? '' : 'lm-studio');
      const startedAt = Date.now();
      let assistantId = null;
      let totalText = '';
      let usage = null;

      // Helper to route text into thinking or answer if special <think> ... </think>
      let inThink = false;
      function routeDelta(txt) {
        if (!txt) return;
        console.log('[DEBUG] routeDelta called with:', txt.substring(0, 100) + (txt.length > 100 ? '...' : ''));
        // naive split on <think> blocks for visualization
        let remaining = txt;
        while (remaining.length) {
          if (!inThink) {
            const i = remaining.indexOf('<think>');
            if (i === -1) {
              console.log('[DEBUG] Sending delta:', remaining.substring(0, 50) + (remaining.length > 50 ? '...' : ''));
              sseWrite(res, 'delta', { content: remaining });
              totalText += remaining;
              remaining = '';
            } else {
              const before = remaining.slice(0, i);
              if (before) {
                console.log('[DEBUG] Sending delta (before think):', before.substring(0, 50) + (before.length > 50 ? '...' : ''));
                sseWrite(res, 'delta', { content: before });
                totalText += before;
              }
              remaining = remaining.slice(i + '<think>'.length);
              inThink = true;
            }
          } else {
            const j = remaining.indexOf('</think>');
            if (j === -1) {
              console.log('[DEBUG] Sending thinking:', remaining.substring(0, 50) + (remaining.length > 50 ? '...' : ''));
              sseWrite(res, 'thinking', { content: remaining });
              remaining = '';
            } else {
              const inside = remaining.slice(0, j);
              if (inside) {
                console.log('[DEBUG] Sending thinking (inside):', inside.substring(0, 50) + (inside.length > 50 ? '...' : ''));
                sseWrite(res, 'thinking', { content: inside });
              }
              remaining = remaining.slice(j + '</think>'.length);
              inThink = false;
            }
          }
        }
      }

      try {
        // Prepend system message when present (chat or user defaults)
        const sys = (db.getChat(user.id, id)?.system || user.settings?.system || '').trim();
        const assembled = [];
        if (sys) assembled.push({ role: 'system', content: sys });
        assembled.push(...contextMessages, { role: 'user', content });
        if (provider === 'ollama') {
          await streamOllama({
            baseUrl,
            model,
            messages: assembled,
            temperature,
            maxTokens,
            onDelta: routeDelta,
            onUsage: (u) => { usage = u; },
          });
        } else {
          await streamOpenAICompatible({
            baseUrl,
            apiKey,
            model,
            messages: assembled,
            temperature,
            maxTokens,
            onDelta: routeDelta,
            onUsage: (u) => { usage = u; },
          });
        }

        const latencyMs = Date.now() - startedAt;
        const assistantMsg = db.appendMessage(user.id, id, {
          role: 'assistant',
          content: totalText,
          model,
          usage,
        });
        assistantId = assistantMsg.id;
        scheduleTitleGeneration({ userId: user.id, chatId: id, provider, baseUrl, apiKey, model });

        sseWrite(res, 'final', { messageId: assistantId, model, usage, latencyMs });
        res.end();
      } catch (e) {
        sseWrite(res, 'error', { message: String(e.message || e) });
        res.end();
      }
      return; // already responded via SSE
    }

    // Message edit/delete
    if ((method === 'PATCH' || method === 'DELETE') && /^\/api\/chats\/[\w-]+\/messages\/[\w-]+$/.test(pathname)) {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const parts = pathname.split('/');
      const chatId = parts[3];
      const msgId = parts[5];
      if (method === 'PATCH') {
        const body = await parseJson(req);
        try {
          const msg = db.updateMessage(user.id, chatId, msgId, { content: body.content });
          return send(res, 200, { message: msg }, withCorsHeaders());
        } catch (e) {
          return send(res, 404, { error: 'Not found' }, withCorsHeaders());
        }
      } else {
        try {
          const ok = db.deleteMessage(user.id, chatId, msgId);
          return send(res, ok ? 200 : 404, ok ? { ok: true } : { error: 'Not found' }, withCorsHeaders());
        } catch (e) {
          return send(res, 404, { error: 'Not found' }, withCorsHeaders());
        }
      }
    }

    // Regenerate: stream a new assistant reply based on a past user message
    if (method === 'POST' && /^\/api\/chats\/[\w-]+\/messages\/[\w-]+\/regenerate$/.test(pathname)) {
      const user = ensureUser(req, res);
      if (!user) return send(res, 401, { error: 'Unauthorized' }, withCorsHeaders());
      const parts = pathname.split('/');
      const chatId = parts[3];
      const msgId = parts[5];
      const chat = db.getChat(user.id, chatId);
      if (!chat) return send(res, 404, { error: 'Not found' }, withCorsHeaders());
      const idx = (chat.messages || []).findIndex((m) => m.id === msgId);
      if (idx < 0) return send(res, 404, { error: 'Message not found' }, withCorsHeaders());
      // Determine the user message to regenerate from
      let userIdx = idx;
      if (chat.messages[userIdx].role !== 'user') {
        for (let i = userIdx - 1; i >= 0; i--) {
          if (chat.messages[i].role === 'user') { userIdx = i; break; }
        }
      }
      if (chat.messages[userIdx].role !== 'user') return send(res, 400, { error: 'No user message context found' }, withCorsHeaders());

      // Start SSE
      sseInit(req, res);
      const settings = user.settings || {};
      const provider = (settings.provider || 'openai').toLowerCase();
      const baseUrl = settings.baseUrl || (provider === 'ollama' ? 'http://localhost:11434' : 'http://localhost:1234');
      const apiKey = settings.apiKey || (provider === 'openai' ? '' : 'lm-studio');
      const model = chat.model || settings.model || '';
      const temperature = settings.temperature ?? 0.7;
      const maxTokens = settings.max_tokens ?? 512;
      const sys = (chat.system || settings.system || '').trim();
      const prior = chat.messages.slice(0, userIdx + 1).map((m) => ({ role: m.role, content: m.content }));
      const assembled = [];
      if (sys) assembled.push({ role: 'system', content: sys });
      assembled.push(...prior);

      let totalText = '';
      let usage = null;
      const startedAt = Date.now();
      let inThink = false;
      function routeDelta(txt) {
        if (!txt) return;
        let remaining = txt;
        while (remaining.length) {
          if (!inThink) {
            const i = remaining.indexOf('<think>');
            if (i === -1) {
              sseWrite(res, 'delta', { content: remaining });
              totalText += remaining;
              remaining = '';
            } else {
              const before = remaining.slice(0, i);
              if (before) { sseWrite(res, 'delta', { content: before }); totalText += before; }
              remaining = remaining.slice(i + '<think>'.length);
              inThink = true;
            }
          } else {
            const j = remaining.indexOf('</think>');
            if (j === -1) { sseWrite(res, 'thinking', { content: remaining }); remaining = ''; }
            else { const inside = remaining.slice(0, j); if (inside) sseWrite(res, 'thinking', { content: inside }); remaining = remaining.slice(j + '</think>'.length); inThink = false; }
          }
        }
      }

      try {
        if (provider === 'ollama') {
          await streamOllama({ baseUrl, model, messages: assembled, temperature, maxTokens, onDelta: routeDelta, onUsage: (u) => { usage = u; } });
        } else {
          await streamOpenAICompatible({ baseUrl, apiKey, model, messages: assembled, temperature, maxTokens, onDelta: routeDelta, onUsage: (u) => { usage = u; } });
        }
        const latencyMs = Date.now() - startedAt;
        const saved = db.appendMessage(user.id, chatId, { role: 'assistant', content: totalText, model, usage });
        scheduleTitleGeneration({ userId: user.id, chatId, provider, baseUrl, apiKey, model });
        sseWrite(res, 'final', { messageId: saved.id, model, usage, latencyMs });
        res.end();
      } catch (e) {
        sseWrite(res, 'error', { message: String(e.message || e) });
        res.end();
      }
      return;
    }

    return send(res, 404, { error: 'Not found' }, withCorsHeaders());
  } catch (e) {
    return send(res, 500, { error: String(e.message || e) });
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if (url.pathname.startsWith('/api/')) {
    return handleApi(req, res, url);
  }
  return serveStatic(req, res, url);
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`NJ-Chat server running on http://localhost:${PORT}`);
});




























