NJ-Chat
=======

A minimal, modern chat app (similar to ChatGPT/Claude/OpenWebUI) with:

- User accounts (register/login/logout)
- Theme selector (system/dark/light)
- Chat history with titles, delete, autoretitle from first message
- Model selection, temperature, and context length controls
- Streaming responses with a thinking animation and basic reasoning support
- Provider backends: LM Studio, OpenAI-compatible, and Ollama
- Model metrics (tokens if provided, latency)

This implementation avoids external dependencies and uses a simple JSON file store, making it easy to run anywhere with Node.js 18+.

Quick Start
-----------

Prerequisites:

- Node.js 18+ (for built-in `fetch` and good streaming support)
- At least one provider running locally or accessible over network:
  - LM Studio: enable the local server (default `http://localhost:1234`)
  - Ollama: install and run (default `http://localhost:11434`)
  - OpenAI-compatible: any server exposing `/v1/chat/completions` (e.g. OpenAI)

Run the server (backend):

1. From the repo root:

   - Windows PowerShell: `node server/server.js`
   - macOS/Linux: `node server/server.js`

2. Open `http://localhost:3000` in your browser.

3. Create an account and open Settings (gear icon) to configure:

   - Provider: `OpenAI-Compatible / LM Studio` or `Ollama`
   - Base URL: e.g. `http://localhost:1234` (LM Studio) or `http://localhost:11434` (Ollama) or `https://api.openai.com`
   - API Key: required for OpenAI-compatible (LM Studio accepts any value, e.g. `lm-studio`)
   - Default model: e.g. `llama3:latest` (Ollama) or your LM Studio/OpenAI model ID

Folders
-------

- `server/` – lightweight Node HTTP server, providers, and JSON file storage
- `public/` – SPA frontend (vanilla HTML/CSS/JS)
- `data/` – JSON storage created at runtime (users, chats, messages)

Next.js UI (Optional, Recommended)
----------------------------------

For a modern responsive UI using TypeScript, Tailwind, and shadcn components, use the Next.js app under `web/`.

Setup:

1. In `web/`, install deps (requires network):

   - `cd web`
   - `npm install`

2. Ensure the backend is running on port 3000 in a separate terminal:

   - `node server/server.js`

3. In `web/`, run the Next.js dev server on port 3001:

   - `npm run dev`

4. Open `http://localhost:3001`.

   - The Next.js app talks to the backend at `http://localhost:3000` via CORS with credentials.
   - You can change the API base via env: set `NEXT_PUBLIC_API_BASE` in `web/.env.local` (e.g., `NEXT_PUBLIC_API_BASE=http://localhost:3000`).

Notes:

- The legacy SPA under `public/` remains available at `http://localhost:3000`.
- The Next.js UI provides improved login/signup, responsiveness, and component quality.

Features
--------

- User auth using PBKDF2 password hashing and signed tokens (JWT-like HS256)
- Static serving of frontend, clean API endpoints under `/api`:
  - `POST /api/auth/register`, `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/me`
  - `POST /api/settings`, `GET /api/models`
  - `GET /api/chats`, `POST /api/chats`, `GET /api/chats/:id`, `DELETE /api/chats/:id`
  - `POST /api/chats/:id/messages` (streams the assistant response via SSE)
- Providers:
  - OpenAI-compatible (including LM Studio): streams via `/v1/chat/completions`
  - Ollama: streams via `/api/chat`
- Thinking support: if the model emits `<think> ... </think>` blocks, they are shown with a dedicated animated panel while streaming
- Metrics: displays tokens (if provided by upstream) and latency

Provider Notes
--------------

- LM Studio
  - Enable local server. Default base URL: `http://localhost:1234`
  - API key can be any placeholder (e.g. `lm-studio`)
  - Uses the OpenAI-compatible Chat Completions API

- Ollama
  - Default base URL: `http://localhost:11434`
  - Use model IDs like `llama3:latest`
  - Streaming is handled via `/api/chat` JSON lines; tokens are shown if available

- OpenAI-Compatible (e.g., OpenAI)
  - Set base URL to `https://api.openai.com` and provide your API key
  - Model list is fetched from `/v1/models`

Security & Caveats
------------------

- Demo-level auth. Passwords are hashed (PBKDF2), tokens are signed (HS256), but there’s no rate limiting or email verification.
- JSON file storage: not suited for heavy concurrency or large datasets.
- Usage metrics depend on provider support. If usage isn’t provided in streaming, only latency is shown.
- Reasoning models: the UI treats `<think>...</think>` text specially. If a provider exposes a separate reasoning channel in the future, it can be wired to the `thinking` SSE event in `server/server.js`.

Customization
-------------

- Environment:
  - `PORT`: change server port (default 3000)
  - `JWT_SECRET`: change the signing secret for tokens

- Styling: edit `public/styles.css`

- Behavior: see provider implementations in `server/providers/` and storage in `server/storage.js`.

License
-------

This is intended as a starter/reference implementation. Use at your own risk.
