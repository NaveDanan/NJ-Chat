const MAX_TITLE_LENGTH = 60;
const MAX_CONVERSATION_CHARS = 2400;
const FALLBACK_TITLE = "New Chat";

function trimConversation(messages) {
  const filtered = (messages || []).filter((m) => m && typeof m.content === "string" && m.content.trim().length);
  if (!filtered.length) return [];
  // Keep the first user message for context and the most recent few turns.
  const firstUserIndex = filtered.findIndex((m) => m.role === "user");
  const head = firstUserIndex >= 0 ? filtered.slice(0, firstUserIndex + 1) : [];
  const tail = filtered.slice(-6);
  const combined = [...head, ...tail];
  // Deduplicate while preserving order.
  const seen = new Set();
  const result = [];
  for (const msg of combined) {
    const key = `${msg.role}:${msg.content}`;
    if (seen.has(key)) continue;
    seen.add(key);
    result.push({ role: msg.role, content: msg.content.trim() });
  }
  // Ensure total characters stay under cap.
  let used = 0;
  const bounded = [];
  for (const msg of result) {
    if (used >= MAX_CONVERSATION_CHARS) break;
    const remaining = MAX_CONVERSATION_CHARS - used;
    const content = msg.content.length > remaining ? msg.content.slice(0, remaining) : msg.content;
    bounded.push({ role: msg.role, content });
    used += content.length;
  }
  return bounded;
}

function buildPromptFromConversation(conversation) {
  if (!conversation.length) return null;
  const lines = conversation.map((m) => `${m.role === "assistant" ? "Assistant" : "User"}: ${m.content}`);
  return lines.join("\n");
}

function cleanTitle(raw) {
  if (!raw) return null;
  let title = String(raw).split(/\r?\n/)[0];
  if (!title) return null;
  title = title.replace(/["'“”`]/g, "").trim();
  if (!title) return null;
  title = title.replace(/^(Title:?\s*)/i, "");
  title = title.replace(/[:;.,!?]+$/g, "");
  title = title.replace(/\s+/g, " ");
  if (!title) return null;
  if (title.length > MAX_TITLE_LENGTH) {
    title = title.slice(0, MAX_TITLE_LENGTH).trim();
  }
  return title || null;
}

async function requestOpenAICompatible({ baseUrl, apiKey, model, messages }) {
  if (!baseUrl || !model) return null;
  const url = baseUrl.replace(/\/$/, "") + "/v1/chat/completions";
  const headers = { "Content-Type": "application/json" };
  if (apiKey) headers["Authorization"] = `Bearer ${apiKey}`;
  const body = {
    model,
    max_tokens: 32,
    temperature: 0.2,
    stream: false,
    messages,
  };
  const res = await fetch(url, { method: "POST", headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Title generation failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  const content = data?.choices?.[0]?.message?.content;
  return cleanTitle(content);
}

async function requestOllama({ baseUrl, model, messages }) {
  if (!baseUrl || !model) return null;
  const url = baseUrl.replace(/\/$/, "") + "/api/chat";
  const body = {
    model,
    stream: false,
    options: {
      temperature: 0.2,
      num_predict: 64,
    },
    messages,
  };
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Ollama title generation failed (${res.status}): ${text}`);
  }
  const data = await res.json();
  const content = data?.message?.content;
  return cleanTitle(content);
}

async function generateChatTitle({ provider, baseUrl, apiKey, model, messages }) {
  const conversation = trimConversation(messages);
  if (!conversation.length) return null;

  const firstAssistantIndex = conversation.findIndex((m) => m.role === "assistant");
  const focusMessages = firstAssistantIndex >= 0 ? conversation.slice(0, firstAssistantIndex + 1) : conversation.slice(0, 2);
  const prompt = buildPromptFromConversation(focusMessages);
  if (!prompt) return null;

  const llmMessages = [
    {
      role: "system",
      content:
        "You write concise, informative chat titles in Title Case. Use at most 6 words, no punctuation at the end, and no numbering.",
    },
    {
      role: "user",
      content: `Use the assistant's first reply to craft a short title.\n\nConversation snippet:\n${prompt}\n\nRespond with the title only.`,
    },
  ];

  try {
    if ((provider || "openai").toLowerCase() === "ollama") {
      return await requestOllama({ baseUrl, model, messages: llmMessages });
    }
    return await requestOpenAICompatible({ baseUrl, apiKey, model, messages: llmMessages });
  } catch (err) {
    console.warn("[title-generator]", err?.message || err);
    return null;
  }
}

module.exports = {
  generateChatTitle,
  cleanTitle,
  trimConversation,
  buildPromptFromConversation,
  FALLBACK_TITLE,
};


