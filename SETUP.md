# Cascade — Local Setup Guide

This guide gets the Cascade platform running locally for beta testing.

## Prerequisites

Install these on your machine:
- [Bun](https://bun.sh) >= 1.3 (`irm bun.sh/install.ps1 | iex` on Windows)
- [Node.js](https://nodejs.org) >= 22 (for VS Code fork build)
- [Python](https://python.org) >= 3.12 + [uv](https://docs.astral.sh/uv/) (`pip install uv`)
- [Docker](https://docker.com) (for Postgres + Redis)
- [yarn](https://yarnpkg.com) classic (`npm i -g yarn`) — needed by VS Code fork
- Git (with long paths enabled: `git config --global core.longpaths true`)

## Step 1: Install dependencies

```bash
# TS dependencies (root)
bun install

# Python dependencies (model router)
cd services/model-router
python -m uv sync
cd ../..

# VS Code fork dependencies (takes ~5 min)
cd apps/desktop
bun scripts/setup.ts
cd ../..
```

## Step 2: Start infrastructure

```bash
docker compose up -d
```

This starts Postgres (with pgvector) on port 5432 and Redis on port 6379.

## Step 3: Configure environment

```bash
cp services/control-plane/.env.example services/control-plane/.env
```

Edit `.env` and set:
- `DATABASE_URL=postgres://cascade:cascade@localhost:5432/cascade`
- `JWT_SECRET=<any random string>`
- `STRIPE_SECRET_KEY=sk_test_...` (your Stripe test key — optional, billing degrades gracefully)
- `STRIPE_WEBHOOK_SECRET=whsec_...` (your Stripe webhook secret — optional)

## Step 4: Run database migrations

```bash
cd services/control-plane
bun run db:generate   # generate migration SQL from schema
bun run db:migrate    # apply migrations
cd ../..
```

## Step 5: Start all services

```bash
bun scripts/dev-launcher.ts
```

This starts:
- Control plane → http://localhost:8080
- Model router → http://localhost:8081
- Local agent runtime → http://localhost:8083
- Memory service → http://localhost:8084

Verify: `curl http://localhost:8080/healthz` should return `{"ok":true}`

## Step 6: Build and run the VS Code fork

```bash
cd apps/desktop
bun scripts/build.ts    # compile VS Code (takes ~10 min first time)
bun scripts/run.ts      # launch the Cascade IDE
```

Or for dev mode (faster, no full packaging):
```bash
cd apps/desktop/vscode
yarn electron
```

## Step 7: Use the Cascade IDE

1. Open the Cascade activity bar icon (left sidebar)
2. Run command "Cascade: Sign In" — paste your API token
   - To get a token: `POST http://localhost:8080/v1/auth/signup` with email/password/org_name
3. Enter a coding task in the Command Center prompt
4. Watch the agent execute (read files, edit, run tests) in the event log

## Step 8: Configure an LLM key (BYO-key)

Sign up at [Anthropic](https://console.anthropic.com) or [OpenAI](https://platform.openai.com),
get an API key, then register it:

```bash
curl -X POST http://localhost:8080/v1/byo-keys \
  -H "Authorization: Bearer <your-token>" \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic","key":"sk-ant-...","label":"my key"}'
```

Set the `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` env var for the model router to use your key.

## Troubleshooting

- **Port already in use**: change the PORT env var for the conflicting service
- **VS Code fork build fails**: ensure yarn classic is installed, node-gyp works, and you have build tools (VS Build Tools on Windows)
- **Model router won't start**: run `cd services/model-router && python -m uv sync` first
- **Agent tasks fail**: check that the model router is running and you have a valid LLM API key
- **DB connection fails**: ensure `docker compose up -d` is running and DATABASE_URL is correct

## Architecture overview

```
User → VS Code Fork (Cascade IDE)
         ↓ (extension calls)
    Local Agent Runtime (port 8083)
         ↓ (LLM calls)
    Model Router (port 8081)
         ↓
    Anthropic / OpenAI / xAI / Google
         ↓ (tool results)
    Local Agent Runtime → edits files, runs commands
         ↓ (events)
    Cascade IDE Command Center (live log)
         ↓ (sync)
    Control Plane (port 8080) ← auth, billing, tasks, usage
    Memory Service (port 8084) ← local cache + cloud sync
```
