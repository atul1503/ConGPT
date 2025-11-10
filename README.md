# ConGPT – Branch-Aware LLM Threading

ConGPT delivers a Twitter-style conversation experience backed by OpenAI. Every user post (root or reply) immediately triggers an assistant response, and each branch maintains isolated context—think lineage rules: a branch only remembers its ancestors and descendants, never its siblings.

The backend prunes state so that **only the branch you are currently exploring** (its root, ancestors, and descendants) lives in memory. This keeps context clean and predictable for every response.

---

## Features

- **Branch-isolated memory** – Replies see only their ancestor path. Sibling branches disappear from context automatically.
- **Single-level navigation** – The UI shows one parent post, its direct children, and a reply box for that parent.
- **Fast branch hopping** – `Expand post` focuses on any child branch, while `Go to parent` moves up the tree.
- **Safe key handling** – The browser never touches your OpenAI key; all calls run through the Express backend.
- **Modern stack** – Express + Vite + React with hot reload for rapid iteration.

---

## Repository Layout

```
ConGPT/
├── backend/            # Express server (OpenAI integration + branch pruning)
├── frontend/           # Vite + React client
├── env.example         # Frontend environment template
├── README.md           # Project documentation (this file)
└── .gitignore
```

---

## Prerequisites

- **Node.js 18+** (tested with Node 18 and 20)
- **npm** (bundled with Node)
- **OpenAI API key** with access to your chosen chat model (default `gpt-4o-mini`)

> _Recommendation:_ If you use `nvm`, run `nvm use 18` (or newer) inside both `backend/` and `frontend/`.

---

## Setup Instructions

### 1. Clone & Install

```bash
# Clone the repository
git clone <repo-url> ConGPT
cd ConGPT

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### 2. Configure Environment Variables

Each side has its own `.env`. Copy the provided templates, then edit as needed.

#### Backend (`backend/.env`)

```bash
cd backend
cp env.example .env
```

Set or verify:

| Variable        | Required | Default                              | Description |
|-----------------|----------|--------------------------------------|-------------|
| `OPENAI_API_KEY`| ✅        | _none_                               | Your OpenAI secret key. |
| `OPENAI_MODEL`  | ❌        | `gpt-4o-mini`                        | Chat model requested from OpenAI. |
| `PORT`          | ❌        | `8000`                               | HTTP port for the Express server. |
| `CLIENT_ORIGIN` | ❌        | `http://localhost:5173,http://127.0.0.1:5173` | Allowed browser origins (comma-separated). |

> The server prunes state after every message so only the active branch survives. No stale branches remain in memory.

#### Frontend (`frontend/.env`)

```bash
cd ../frontend
cp env.example .env
```

| Variable              | Required | Default                 | Description |
|-----------------------|----------|-------------------------|-------------|
| `VITE_API_BASE_URL`   | ❌        | `http://localhost:8000` | Base URL of the backend API. If omitted it falls back to `window.location.origin`. |

---

## Running Locally

Choose the workflow that fits your needs.

### Development (hot reload)

Use two terminal tabs—one for the backend APIs and another for the Vite dev server.

#### Backend (APIs)

```bash
cd /path/to/ConGPT/backend
npm run dev
```

Starts Express with nodemon at `http://localhost:8000` (unless you set a different port). Watch the logs for any OpenAI errors.

### Frontend

```bash
cd /path/to/ConGPT/frontend
npm run dev
```

Vite serves the UI at `http://localhost:5173` with hot module reload.

### Single-server run (backend serves frontend)

```bash
# Option 1: from the repo root
cd /path/to/ConGPT
npm run serve

# Option 2: from the backend directory (what npm run serve calls internally)
cd /path/to/ConGPT/backend
npm run serve
```

Either command builds the frontend (`npm run build` inside `frontend/`) and starts Express on `http://localhost:8000` while serving the built static assets from the same origin. Because the React bundle defaults to `window.location.origin`, no extra configuration is required when both UI and API are hosted together.

> **Note:** The backend only serves static files if the frontend build (`frontend/dist`) exists. If you run `npm run dev` in the frontend for hot reload, that dev server takes over and the backend skips static serving. For production, always run `npm run serve` (from root or backend) so the build folder is present.

---

## Using the App

1. **Post:** Type in the composer and click `Post`. The assistant answers instantly.
2. **Navigate down:** Click `Expand post` on a child to make it the new parent view. You will see:
   - The selected post highlighted as the parent.
   - A single reply composer targeted at that parent.
   - Only the parent’s immediate children listed.
3. **Navigate up:** Use `↑ Go to parent` on the parent card to move to its ancestor.
4. **Branch isolation:** Branches never mix context. Shifting to a different branch prunes unrelated nodes from memory.

### Manual Branch-Isolation Test

1. Post `Traveling in Italy` → assistant responds.
2. Expand the assistant, reply `Tell me about food in Rome` → assistant answers about Rome.
3. Go back to the assistant and reply `Tell me about museums in Florence` → assistant answers about Florence.
4. Expand the Florence reply and ask `What have we discussed so far here?`

Result: The assistant references only the Italy root + Florence branch. Rome details remain isolated to their own branch.

---

## Scripts Reference

### Backend (`backend/package.json`)

| Script        | Description |
|---------------|-------------|
| `npm run dev` | Start Express with nodemon |
| `npm start`   | Start Express without nodemon |

### Frontend (`frontend/package.json`)

| Script         | Description |
|----------------|-------------|
| `npm run dev`  | Launch Vite dev server |
| `npm run build`| Build production assets |
| `npm run preview` | Preview the production build locally |

---

## Production Notes

- **Persistence:** Current implementation keeps state in memory and prunes aggressively. Add a database (keyed by conversation root or user) for persistence or multi-user support.
- **Authentication:** Protect the backend before exposing it publicly. Everyone who can hit the endpoint can currently create conversations.
- **Scaling:** Consider request quotas, retries, and caching if you expect heavy traffic.
- **Deployment:**
  - Frontend: `npm run build` inside `frontend/` and serve the `dist/` folder (e.g., Vercel, Netlify, or any static host).
  - Backend: Deploy the Express app (e.g., Render, Fly.io, Railway) and configure environment variables (`OPENAI_API_KEY`, etc.). Update `VITE_API_BASE_URL` accordingly.

---

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `model_not_found` errors | Double-check `OPENAI_MODEL` and your API access. |
| CORS 403 errors | Confirm `CLIENT_ORIGIN` includes the frontend URL with the correct scheme and port. |
| Backend port already used | Change `PORT` in `backend/.env` and update `VITE_API_BASE_URL`. |
| Assistant forgets context | Ensure you are viewing the branch you expect—pruning removes all other branches. |

---

## License

This project is currently unlicensed. Add a license file if you plan to publish or distribute.

