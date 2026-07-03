
# InsureWise

InsureWise is an AI-powered insurance comparison and recommendation platform. Users go through a conversational onboarding flow, get ranked policy recommendations, and receive plain-language AI explanations of coverage.

## Quick Start

**Prerequisites:** Node.js 20.19+ or 22.12+, pnpm 9+, PostgreSQL (local, Docker, or hosted), Python 3.10+ (optional, for Moorcheh "Ask Expert")

> **Node version:** Local dev works on Node 20.19+ or 22.12+. Replit deployment uses Node 24 (see `.replit`).

### Option A: Automated setup (recommended)

Requires `psql` on your PATH (native Postgres or Docker — see PostgreSQL section below).

```bash
git clone https://github.com/owenyang2/InsureWise.git
cd InsureWise
pnpm run setup    # installs deps, creates .env, sets up DB, pushes schema
pnpm dev          # starts API + frontend in one command
# Open http://localhost:5173
```

### Option B: Manual setup

```bash
git clone https://github.com/owenyang2/InsureWise.git
cd InsureWise
pnpm install
cp artifacts/api-server/.env.example artifacts/api-server/.env
# Edit .env — set DATABASE_URL (and optionally API keys)
```

```bash
createdb insurewise                                          # or use Docker (see below)
set -a && source artifacts/api-server/.env && set +a         # load env vars
pnpm db:push                                                 # push schema
pnpm dev                                                     # start the app
# Open http://localhost:5173
```

---

## Available Scripts

| Command | What it does |
|---|---|
| `pnpm run setup` | One-time setup: install deps, create `.env`, create DB, push schema |
| `pnpm dev` | Start API server (port 3001) + frontend (port 5173) together |
| `pnpm dev:api` | Start only the API server |
| `pnpm dev:web` | Start only the frontend |
| `pnpm db:push` | Push database schema (requires `DATABASE_URL` env var) |
| `pnpm build` | Type-check and build all packages |

---

## Detailed Setup Guide

### Prerequisites

| Requirement | Version | How to install |
|---|---|---|
| **Node.js** | v20.19+ or v22.12+ (Replit uses 24) | `nvm install 22 && nvm use 22` ([nvm](https://github.com/nvm-sh/nvm)) |
| **pnpm** | v9+ | `npm install -g pnpm` (or use `npx pnpm` everywhere) |
| **PostgreSQL** | 14+ | See options below (Docker, native, or hosted) |
| **Python** | 3.10+ (optional) | For Moorcheh "Ask Expert" only — use a venv on Ubuntu/Debian |
| **Docker** | optional | Easiest Postgres on Linux/WSL2 if you don't want native install |

### API keys

| Key | Required? | Used for | Where to get it | Alternatives |
|---|---|---|---|---|
| `DATABASE_URL` | **Yes** | PostgreSQL via Drizzle ORM | Local Postgres, Docker, or [Neon](https://neon.tech) / [Supabase](https://supabase.com) | Any Postgres connection string |
| `OPENAI_API_KEY` + `OPENAI_BASE_URL` + `AI_MODEL` | **For AI features** | Onboarding chat, policy explain, parse-answer, optimizer | **Recommended:** [platform.openai.com/api-keys](https://platform.openai.com/api-keys) | Any OpenAI-compatible API (Groq, Together, Ollama, etc.) — set `OPENAI_BASE_URL` and `AI_MODEL` |
| `MOORCHEH_API_KEY` | **Optional** | "Ask Expert" RAG only | Free tier: [console.moorcheh.ai/api-keys](https://console.moorcheh.ai/api-keys) | Omit to run without Ask Expert; all other features work |
| Carrier APIs | **None** | Checkout handoffs are mocked demo URLs | N/A | N/A |

**Default AI config (no paid key):** The repo ships defaults pointing at a hackathon Hugging Face Inference Endpoint (`OPENAI_API_KEY=test`). This is **best-effort only** — the endpoint may be shut down at any time. For reliable AI, use your own OpenAI key (see [`.env.example`](artifacts/api-server/.env.example)).

### PostgreSQL setup

**Docker (recommended on Linux/WSL2):**

```bash
docker run --name insurewise-pg \
  -e POSTGRES_PASSWORD=postgres \
  -p 5432:5432 \
  -d postgres:16

docker exec insurewise-pg createdb -U postgres insurewise
```

Set in `artifacts/api-server/.env`:

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/insurewise
```

**macOS (native):**
```bash
brew install postgresql@16
brew services start postgresql@16
createdb insurewise
```

**Linux (Debian/Ubuntu, native):**
```bash
sudo apt install postgresql
sudo systemctl start postgresql
sudo -u postgres createuser --superuser $(whoami)
createdb insurewise
```

**Hosted:** Use [Neon](https://neon.tech) or [Supabase](https://supabase.com) and paste the connection string into `DATABASE_URL`.

### Environment variables

Copy the template: `cp artifacts/api-server/.env.example artifacts/api-server/.env`

**`artifacts/api-server/.env`**

| Variable | Required | Notes |
|---|---|---|
| `PORT` | Yes | API server port (default `3001`) |
| `DATABASE_URL` | Yes | PostgreSQL connection string |
| `OPENAI_API_KEY` | For AI | Use `sk-...` with OpenAI, or `test` with the default HF endpoint |
| `OPENAI_BASE_URL` | For AI | `https://api.openai.com/v1` for OpenAI; see `.env.example` for defaults |
| `AI_MODEL` | For AI | e.g. `gpt-4o-mini` (OpenAI) or `openai/gpt-oss-120b` (default HF) |
| `MOORCHEH_API_KEY` | Optional | Only for `POST /api/ai/ask-expert` |

See [`artifacts/api-server/.env.example`](artifacts/api-server/.env.example) for the full annotated template.

**`artifacts/insurewise/.env`** (optional — `pnpm dev:web` sets defaults):

```env
PORT=5173
BASE_PATH=/
API_PORT=3001
```

### Push database schema

```bash
set -a && source artifacts/api-server/.env && set +a
pnpm db:push
```

### Moorcheh Knowledge Base (optional)

Requires `MOORCHEH_API_KEY` in `.env`. On Ubuntu/Debian, use a virtualenv (system Python blocks `pip install` via PEP 668):

```bash
python3 -m venv .venv
source .venv/bin/activate
pip install -r artifacts/api-server/src/python-workers/requirements.txt
python scripts/seed-moorcheh.py
```

### Start the app

```bash
pnpm dev
# Open http://localhost:5173
```

The frontend proxies `/api/*` requests to the API server on port 3001.

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `pnpm: command not found` | `npm install -g pnpm` or use `npx pnpm` instead |
| Node version / Vite errors | `nvm install 22 && nvm use 22` (local dev: 20.19+ or 22.12+) |
| `Cannot find native binding` | `rm -rf node_modules && pnpm install` |
| `psql: command not found` | Install Postgres natively, or use Docker (see PostgreSQL section) |
| `role "xxx" does not exist` (Postgres) | `sudo -u postgres createuser --superuser $(whoami)` |
| AI chat / explain returns 500 | Default HF endpoint may be down — set your own `OPENAI_API_KEY` + `OPENAI_BASE_URL` |
| `externally-managed-environment` (pip) | Use a venv: `python3 -m venv .venv && source .venv/bin/activate` |
| Moorcheh API errors | Check `MOORCHEH_API_KEY` in `.env` — get one at [console.moorcheh.ai](https://console.moorcheh.ai/api-keys) |
| `python3: command not found` | Install Python 3.10+; needed for Moorcheh workers |
| Empty Moorcheh answers | Run `python scripts/seed-moorcheh.py` to seed the knowledge base |
| Frontend can't reach API | Ensure API is running on port 3001 before starting frontend |

---

## Features

- **AI Onboarding Chat** — Structured question flow with tappable answer chips
- **Dual AI Engine Routing**:
  - **OpenAI Parser:** Extracts structured form data from conversational text
  - **Moorcheh Knowledge Assistant (RAG):** Semantic search over insurance knowledge base
  - **Manual UI Override:** Toggle between "Auto", "Moorcheh Expert", or "OpenAI Parser" modes
- **Policy Comparison** — Priority-weighted ranking with price, coverage, and rating sliders
- **AI Policy Explainer** — Plain-language coverage breakdown
- **Premium Optimizer** — AI tips to lower your premium
- **Profile Management** — Edit details and re-run optimizer

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React + Vite + Tailwind CSS + shadcn/ui |
| State | Zustand (localStorage persisted) |
| Backend | Express 5 (Node.js) |
| Database | PostgreSQL + Drizzle ORM |
| RAG Engine | Moorcheh AI (via Python `moorcheh-sdk`) |
| AI | GPT-OSS 120B (OpenAI-compatible API) |
| Monorepo | pnpm workspaces |

## Project Structure

```
├── artifacts/
│   ├── api-server/          # Express REST API
│   │   └── src/
│   │       ├── routes/      # users.ts, insurance.ts, ai.ts
│   │       ├── lib/         # mockPolicies.ts — mock data + scoring engine
│   │       └── python-workers/  # Moorcheh SDK worker
│   └── insurewise/          # React + Vite frontend
│       └── src/
│           ├── pages/       # Home, Onboarding, Compare, PolicyDetail,
│           │                #   Apply, Confirmation, Profile, Optimizer
│           ├── components/  # Navbar, UI components
│           └── store/       # Zustand global state
├── lib/
│   ├── api-spec/            # OpenAPI spec + Orval codegen
│   ├── api-client-react/    # Auto-generated React Query hooks
│   ├── api-zod/             # Auto-generated Zod schemas
│   └── db/                  # Drizzle ORM schema + connection
├── scripts/
│   └── seed-moorcheh.py     # Seed Moorcheh knowledge base
├── setup.sh                 # Automated setup script
```

## API Endpoints

| Method | Path | Description |
|---|---|---|
| GET | `/api/healthz` | Health check |
| GET | `/api/users/profile` | Get user profile (session-based) |
| PUT | `/api/users/profile` | Create or update user profile |
| POST | `/api/insurance/search` | Search and rank policies |
| POST | `/api/insurance/policies/:id/explain` | AI policy analysis |
| POST | `/api/insurance/policies/:id/application` | Get pre-filled application |
| POST | `/api/insurance/applications/submit` | Submit application |
| POST | `/api/insurance/optimize-profile` | AI premium optimization tips |
| POST | `/api/ai/chat` | Conversational onboarding AI |
| POST | `/api/ai/parse-answer` | AI parsing unstructured answers |
| POST | `/api/ai/ask-expert` | Queries Moorcheh Semantic Backend |

## Regenerating API Types

```bash
pnpm --filter @workspace/api-spec run codegen
```

## Notes

- **Session identity** uses `x-session-id` header — the frontend assigns a UUID per browser session in localStorage.
- **AI models** default to a hackathon Hugging Face endpoint (best-effort). For production-like local dev, use your own OpenAI key — see `.env.example`.
- **Knowledge Assistant** requires Python 3.10+, `MOORCHEH_API_KEY`, and optionally `seed-moorcheh.py` for populated answers.
- **Carrier checkout** is mocked — no real insurer API keys are used.
