# Cascade Platform — Agent Rules

## Project
Commercial agentic dev platform + personal AI agent + real-time phone answering service.
Four surfaces: agentic coding IDE (VS Code fork), local personal agent (Tauri tray),
cloud autonomous engineer (gVisor/Firecracker microVMs), voice/phone agent (Twilio + OpenAI
Realtime/xAI). Multi-tenant SaaS, BYO-key-first pricing, bootstrapped, 2–3 person team.

## Docs to read first
- `PHASE1_PLAN.md` — vision, features, business model, decisions (Appendix A).
- `PHASE2_DESIGN.md` — detailed technical design, data model, APIs, implementation order.
- `docs/adr/` — architecture decision records.

## Stack
- TS: Bun + Hono (control plane), Next.js (web), Tauri (tray), VS Code fork (desktop IDE).
- Python: FastAPI (agent-control, voice-control, model-router, cloud-agent runtime).
- DB: Postgres 16 + pgvector; Redis; ClickHouse (usage). Drizzle ORM (TS).
- Infra: Terraform + EKS; gVisor (M3) → Firecracker (later); Twilio (PSTN); OpenAI Realtime + xAI (voice).
- LLMs: Anthropic, OpenAI, xAI, Google via Model Router. BYO-key first.

## Commands
- TS install: `bun install` (root).
- TS typecheck: `bun run typecheck`.
- TS test: `bun run test`.
- Control plane dev: `bun --filter ./services/control-plane dev`.
- Protocol validate: `cd shared/agent-protocol/ts && bun run validate`.
- Python (per service): `uv sync && uv run pytest -q`.
- Model router dev: `cd services/model-router && uv run python src/main.py`.
- DB migrate: `cd services/control-plane && bun run db:migrate` (needs Postgres + DATABASE_URL).

## Conventions
- Multi-tenancy: every DB row carries `org_id`; enforce in ORM + DB RLS.
- No secrets in code; env via `.env` (gitignored) or KMS/OS keychain.
- Agent protocol changes: update `shared/agent-protocol/schema/*.json` AND the hand-authored
  TS (`shared/agent-protocol/ts/src/index.ts`) AND Python
  (`shared/agent-protocol/python/src/cascade_agent_protocol/__init__.py`). Codegen later.
- New architectural decisions: add an ADR in `docs/adr/` and update its README index.
- Pre-commit: no secrets; `bun run typecheck` clean; `uv run ruff check` clean for changed Py.
- Do NOT apply Terraform (`terraform apply`) without explicit human confirmation.
- Do NOT register domains, provision real Twilio numbers, or create cloud accounts without
  explicit human confirmation.

## Status
M0 — Foundations (in progress). See `PHASE2_DESIGN.md` §11 for the milestone roadmap.
