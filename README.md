# ALPHA

Agentic coding platform combining four capabilities:
1. **Coding IDE** — VS Code fork with an integrated agent command center
2. **Local personal agent** — tray app with heartbeat scheduler, skills, and messaging
3. **Cloud autonomous engineering** — sandboxed agent swarms that create PRs
4. **Voice/phone answering** — AI agent that answers your phone via Twilio + OpenAI Realtime API

## Quickstart

See [SETUP.md](./SETUP.md) for detailed setup instructions.

```bash
# 1. Install deps
bun install
cd services/model-router && python -m uv sync && cd ../..

# 2. Start infra
docker compose up -d

# 3. Configure env
cp services/control-plane/.env.example services/control-plane/.env
# Edit .env with DATABASE_URL, JWT_SECRET, API keys

# 4. Run DB migrations
cd services/control-plane && bun run db:generate && bun run db:migrate && cd ../..

# 5. Start all services
bun scripts/dev-launcher.ts

# 6. Build & run the IDE
cd apps/desktop && bun scripts/setup.ts && bun scripts/run.ts
```

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         ALPHA IDE (VS Code fork)              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ ALPHA Extension (Command Center webview)               │   │
│  │  • Task prompt → local agent runtime                     │   │
│  │  • Live event log (tool calls, costs, file edits)        │   │
│  │  • Sign-in, billing status, agent controls               │   │
│  └──────────────────────────────────────────────────────────┘   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ HTTP (start task, poll events)
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Local Agent Runtime (port 8083)              │
│  • Tool bus: fs.read/write/list, shell.exec, git.*, search.*   │
│  • Agent loop: plan → execute → verify → repeat                 │
│  • Permission-gated tools with human approval for writes        │
│  • Emits agent protocol events (task.start, tool.call, etc.)   │
└───────────────────────────┬─────────────────────────────────────┘
                            │ LLM calls
                            ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Model Router (port 8081, Python)             │
│  • Anthropic adapter (Claude models)                            │
│  • OpenAI adapter (GPT models)                                  │
│  • Provider routing, cost tracking, streaming                   │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                    Tray Agent (port 8085)                       │
│  • Heartbeat scheduler: cron + interval proactive actions       │
│  • Skills registry: 5 built-in skills + marketplace install    │
│  • Messaging: Slack, SMS (Twilio), Email (Resend), console     │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                 Cloud Agent Runtime (port 8088)                 │
│  • Sandbox manager: Docker (dev) / gVisor (prod)                │
│  • Swarm orchestrator: parallel subtasks, dependency handling   │
│  • GitHub integration: branch, commit, PR creation              │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                   Voice Service (port 8089)                     │
│  • Twilio: phone number provisioning, inbound/outbound calls    │
│  • OpenAI Realtime API: speech-to-text → LLM → text-to-speech   │
│  • SMS, call transcripts, US/CA only                            │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Control Plane (port 8080)                      │
│  • Auth (JWT), org, seats, roles                                │
│  • BYO-key management (Anthropic, OpenAI, xAI, Google)          │
│  • Tasks, usage metering, spend caps                            │
│  • Stripe billing (Free $0, Pro $19, Team $29/seat)             │
│  • Marketplace (curated + open submission, 70/30 revenue share) │
│  • Rate limiting, CORS, error handling                          │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│                  Memory Service (port 8084)                     │
│  • Hierarchical: session < project < user < org                 │
│  • Local SQLite cache + cloud sync (on by default)              │
│  • Keyword search (semantic search post-M4)                     │
└─────────────────────────────────────────────────────────────────┘
```

## Services

| Service | Port | Tech | Purpose |
|---|---|---|---|
| Control plane | 8080 | Bun + Hono + Drizzle | Auth, billing, tasks, marketplace |
| Model router | 8081 | Python + FastAPI | LLM routing (Anthropic, OpenAI) |
| Local agent | 8083 | Bun + Hono | Tool bus, agent loop |
| Memory service | 8084 | Bun + Hono + SQLite | Hierarchical memory + cloud sync |
| Tray agent | 8085 | Bun + Hono | Heartbeats, skills, messaging |
| Cloud agent | 8088 | Bun + Hono | Sandboxes, swarm, GitHub PRs |
| Voice service | 8089 | Bun + Hono + WebSocket | Twilio + OpenAI Realtime API |

## Testing

```bash
# TS unit tests (bun:test)
cd runtimes/local-agent && bun test    # 18 tests
cd apps/tray-agent && bun test         # 13 tests

# Typecheck all TS packages
bun run typecheck

# Python lint + test
cd services/model-router && uv run ruff check src && uv run pytest -q
```

## Tech Stack

- **Runtime:** Bun 1.3 (TS services), Python 3.12 (model router)
- **Web framework:** Hono (TS), FastAPI (Python)
- **Database:** PostgreSQL 16 + pgvector, Redis 7, SQLite (local cache)
- **ORM:** Drizzle (TS), SQLAlchemy (Python)
- **IDE:** VS Code 1.99.3 fork
- **LLM providers:** Anthropic, OpenAI, xAI, Google (BYO-key)
- **Billing:** Stripe (subscriptions + checkout + webhooks)
- **Voice:** Twilio (phone) + OpenAI Realtime API (conversation)
- **Messaging:** Slack, Twilio SMS, Resend (email)
- **Infra:** Terraform (EKS, Postgres, Redis, KMS), Docker Compose (local)
- **CI:** GitHub Actions (typecheck, test, lint, terraform fmt)

## Project Structure

```
apps/
  desktop/          VS Code fork + ALPHA extension
  tray-agent/       Personal agent (heartbeats, skills, messaging)
  web/              Web dashboard (M4)
services/
  control-plane/    Auth, billing, tasks, marketplace
  model-router/     LLM routing (Python)
  memory-service/   Hierarchical memory + cloud sync
  voice-service/    Twilio + OpenAI Realtime API
runtimes/
  local-agent/      Tool bus + agent loop (local)
  cloud-agent/      Sandboxes + swarm orchestrator (cloud)
shared/
  agent-protocol/   JSON Schema + TS types + Pydantic models
  skills-sdk/       Skill authoring SDK (M4)
  ui-kit/           Shared UI components (M4)
packages/
  billing-client/   Stripe client wrapper (M4)
  usage-meter/      Usage tracking (M4)
  observability/    Logging + metrics (M4)
infra/
  terraform/        Infrastructure as code
docs/
  adr/              Architecture Decision Records (10 ADRs)
```

## License

Closed source (per ADR-0009).
