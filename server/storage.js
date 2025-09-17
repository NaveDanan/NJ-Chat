const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, '..', 'data');
const USERS_FILE = path.join(DATA_DIR, 'users.json');

function ensureDir(p) {
  if (!fs.existsSync(p)) fs.mkdirSync(p, { recursive: true });
}

function readJSON(file, fallback) {
  try {
    if (!fs.existsSync(file)) return fallback;
    const data = fs.readFileSync(file, 'utf-8');
    return data ? JSON.parse(data) : fallback;
  } catch (e) {
    return fallback;
  }
}

function writeJSONAtomic(file, obj) {
  ensureDir(path.dirname(file));
  const tmp = file + '.' + crypto.randomBytes(6).toString('hex') + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

function uid() {
  return crypto.randomBytes(12).toString('hex');
}

function loadUsers() {
  ensureDir(DATA_DIR);
  return readJSON(USERS_FILE, { users: [] });
}

function saveUsers(data) {
  writeJSONAtomic(USERS_FILE, data);
}

function getUserByEmail(email) {
  const db = loadUsers();
  return db.users.find((u) => u.email.toLowerCase() === (email || '').toLowerCase()) || null;
}

function getUserById(id) {
  const db = loadUsers();
  return db.users.find((u) => u.id === id) || null;
}

function createUser({ email, passwordHash, salt }) {
  const db = loadUsers();
  const now = new Date().toISOString();
  const user = {
    id: uid(),
    email,
    passwordHash,
    salt,
    createdAt: now,
    settings: {
      provider: 'openai',
      baseUrl: 'http://localhost:1234', // LM Studio default
      apiKey: 'lm-studio',
      model: '',
      temperature: 0.7,
      max_tokens: 512,
      system: '',
      theme: 'system',
    },
  };
  db.users.push(user);
  saveUsers(db);
  return user;
}

function updateUserSettings(userId, partial) {
  const db = loadUsers();
  const user = db.users.find((u) => u.id === userId);
  if (!user) throw new Error('User not found');
  user.settings = { ...user.settings, ...partial };
  saveUsers(db);
  return user.settings;
}

function chatsDir(userId) {
  return path.join(DATA_DIR, 'chats', userId);
}

function chatFile(userId, chatId) {
  return path.join(chatsDir(userId), `${chatId}.json`);
}

function indexFile(userId) {
  return path.join(chatsDir(userId), `index.json`);
}

function listChats(userId) {
  const index = readJSON(indexFile(userId), { chats: [] });
  // Sort by updatedAt desc
  index.chats.sort((a, b) => (b.updatedAt || '').localeCompare(a.updatedAt || ''));
  return index.chats;
}

function createChat(userId, { title, model, system, folder, pinned }) {
  const id = uid();
  const now = new Date().toISOString();
  const meta = { id, title, model: model || '', createdAt: now, updatedAt: now, folder: folder || '', pinned: !!pinned };
  const index = readJSON(indexFile(userId), { chats: [] });
  index.chats.push(meta);
  writeJSONAtomic(indexFile(userId), index);
  ensureDir(chatsDir(userId));
  const file = chatFile(userId, id);
  writeJSONAtomic(file, { id, title, model: meta.model, system: system || '', folder: meta.folder, pinned: meta.pinned, createdAt: now, updatedAt: now, messages: [] });
  return meta;
}

function getChat(userId, chatId) {
  const file = chatFile(userId, chatId);
  if (!fs.existsSync(file)) return null;
  return readJSON(file, null);
}

function getMessages(userId, chatId) {
  const chat = getChat(userId, chatId);
  if (!chat) return [];
  return (chat.messages || []).map((m) => ({ role: m.role, content: m.content }));
}

function saveChat(userId, chat) {
  const file = chatFile(userId, chat.id);
  chat.updatedAt = new Date().toISOString();
  writeJSONAtomic(file, chat);
  // Update index timestamp and title/model
  const idxPath = indexFile(userId);
  const index = readJSON(idxPath, { chats: [] });
  const entry = index.chats.find((c) => c.id === chat.id);
  if (entry) {
    entry.title = chat.title;
    entry.model = chat.model;
    entry.folder = chat.folder || '';
    entry.pinned = !!chat.pinned;
    entry.updatedAt = chat.updatedAt;
  }
  writeJSONAtomic(idxPath, index);
}

function appendMessage(userId, chatId, { role, content, model, usage }) {
  const chat = getChat(userId, chatId);
  if (!chat) throw new Error('Chat not found');
  const msg = {
    id: uid(),
    role,
    content,
    model: model || undefined,
    usage: usage || undefined,
    ts: new Date().toISOString(),
  };
  chat.messages.push(msg);
  saveChat(userId, chat);
  return msg;
}

function updateChatMeta(userId, chatId, patch) {
  const chat = getChat(userId, chatId);
  if (!chat) throw new Error('Chat not found');
  if (typeof patch.title === 'string') chat.title = patch.title;
  if (typeof patch.model === 'string') chat.model = patch.model;
  if (typeof patch.system === 'string') chat.system = patch.system;
  if (typeof patch.folder === 'string') chat.folder = patch.folder;
  if (typeof patch.pinned === 'boolean') chat.pinned = patch.pinned;
  saveChat(userId, chat);
  return chat;
}

function updateMessage(userId, chatId, messageId, patch) {
  const chat = getChat(userId, chatId);
  if (!chat) throw new Error('Chat not found');
  const msg = (chat.messages || []).find((m) => m.id === messageId);
  if (!msg) throw new Error('Message not found');
  if (typeof patch.content === 'string') msg.content = patch.content;
  if (patch.usage !== undefined) msg.usage = patch.usage;
  if (patch.model !== undefined) msg.model = patch.model;
  saveChat(userId, chat);
  return msg;
}

function deleteMessage(userId, chatId, messageId) {
  const chat = getChat(userId, chatId);
  if (!chat) throw new Error('Chat not found');
  const before = chat.messages.length;
  chat.messages = chat.messages.filter((m) => m.id !== messageId);
  const changed = before !== chat.messages.length;
  if (changed) saveChat(userId, chat);
  return changed;
}

function deleteChat(userId, chatId) {
  const idxPath = indexFile(userId);
  const index = readJSON(idxPath, { chats: [] });
  const next = index.chats.filter((c) => c.id !== chatId);
  if (next.length === index.chats.length) return false;
  writeJSONAtomic(idxPath, { chats: next });
  const file = chatFile(userId, chatId);
  if (fs.existsSync(file)) fs.unlinkSync(file);
  return true;
}

function ensureChatTitle(userId, chatId) {
  const chat = getChat(userId, chatId);
  if (!chat) return;
  if (chat.title && chat.title !== 'New Chat') return;
  const firstUser = (chat.messages || []).find((m) => m.role === 'user');
  if (firstUser) {
    const t = firstUser.content.replace(/\s+/g, ' ').slice(0, 50);
    chat.title = t || 'New Chat';
    saveChat(userId, chat);
  }
}

module.exports = {
  getUserByEmail,
  getUserById,
  createUser,
  updateUserSettings,
  listChats,
  createChat,
  getChat,
  getMessages,
  appendMessage,
  updateChatMeta,
  updateMessage,
  deleteMessage,
  deleteChat,
  ensureChatTitle,
};
