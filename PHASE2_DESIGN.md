# Phase 2 — Detailed Technical Design
# Project: [name TBD] — Commercial Agentic Dev Platform + Personal Agent + Phone AI

> **Status:** Technical design only. No production code is written until this document is reviewed
> and approved. All decisions from Phase 1 Appendix A are baked in.

## Phase 1 decisions baked into this design
- All four surfaces at launch: coding IDE (VS Code fork), local personal agent, cloud autonomous
  agent, voice/phone answering.
- Dual client: desktop (forked VS Code + tray agent) + web dashboard.
- BYO-key-first pricing; managed keys as paid upsell. Lower list prices.
- LLM providers: Anthropic, OpenAI, xAI, Google (all via Model Router).
- Bootstrapped, 2–3 person team. US/CA phone only. Lean compliance post-launch.
- Custom thin orchestrator (no LangGraph/CrewAI). Fork VS Code.
- Voice: managed realtime APIs (OpenAI Realtime + xAI) at launch; self-host ASR/TTS later.
- Fully closed source. Cloud memory sync ON by default (opt-out). Marketplace at launch.

---

## 1. System Architecture (detailed)

### 1.1 Component map
```
                         ┌─────────────────────────────────────────────┐
                         │  CLIENTS                                    │
                         │  Desktop: VS Code fork (IDE) + Tray Agent   │
                         │  Web: dashboard + softphone (browser)       │
                         └──────────────┬──────────────────────────────┘
                                        │ HTTPS + WSS (control) / WebRTC (media)
                         ┌──────────────▼──────────────────────────────┐
                         │  EDGE / GATEWAY                             │
                         │  - API gateway (auth, rate limit, tenant)   │
                         │  - WSS gateway (agent streams, call events) │
                         │  - WebRTC/SIP media edge (regional)         │
                         └──────────────┬──────────────────────────────┘
                                        │
         ┌──────────────────────────────┼──────────────────────────────┐
         │                              │                              │
┌────────▼─────────┐         ┌──────────▼──────────┐         ┌─────────▼──────────┐
│  CONTROL PLANE   │         │  AGENT CONTROL      │         │  VOICE CONTROL     │
│  (multi-tenant)  │         │  (orchestration)    │         │  (telephony)       │
│  - Auth/Org/Seat │         │  - Task scheduler   │         │  - Twilio adapter  │
│  - Billing/Usage │         │  - Agent registry   │         │  - Number mgmt     │
│  - Memory svc    │◄────────┤  - Checkpoint store │◄────────┤  - Call sessions   │
│  - Skills registry│        │  - Tool bus         │         │  - Realtime bridge │
│  - Marketplace   │         │  - Swarm planner    │         │  - RAG during call │
│  - Webhooks hub  │         │  - Cost/cap enforcer│         │  - Voicemail       │
│  - Observability │         │  - Replay engine    │         │  - Transcripts     │
└────────┬─────────┘         └──────────┬──────────┘         └─────────┬──────────┘
         │                              │                              │
         │              ┌───────────────┴───────────────┐              │
         │              │                               │              │
         │     ┌────────▼─────────┐            ┌────────▼─────────┐    │
         │     │ LOCAL AGENT RT   │            │ CLOUD AGENT RT   │    │
         │     │ (user machine)   │            │ (microVMs)       │    │
         │     │ - skills host    │            │ - computer use   │    │
         │     │ - heartbeat sched│            │ - git/CI/PR      │    │
         │     │ - local tools    │            │ - browser        │    │
         │     │ - local mem cache│            │ - ephemeral FS   │    │
         │     │ - local model opt│            │ - no egress      │    │
         │     └────────┬─────────┘            └────────┬─────────┘    │
         │              │                               │              │
         └──────────────┴───────────┬───────────────────┴──────────────┘
                                      │
                         ┌────────────▼───────────────┐
                         │  MODEL ROUTER              │
                         │  - provider adapters       │──▶ Anthropic / OpenAI / xAI / Google
                         │  - cost/latency/quality    │──▶ (BYO-key or managed)
                         │  - caching, prompt compress│──▶ local model (Ollama) optional
                         │  - streaming + tool-call   │
                         └────────────────────────────┘
```

### 1.2 Trust boundaries
1. **User device** — local agent runs here; user-owned; least trusted by cloud but most trusted by user.
2. **Control plane** — trusted service, multi-tenant, per-tenant keys.
3. **Cloud agent microVM** — untrusted, ephemeral, no network egress except allow-listed model router.
4. **Voice media edge** — trusted, handles RTP/media + realtime LLM bridge.
5. **LLM providers** — external; prompts may contain user data; BYO-key keeps us out of the path.

### 1.3 Data flow for a coding task (local → cloud handoff)
1. User issues task in IDE → local agent plans → edits locally → runs tests.
2. Task exceeds local budget/needs CI → local agent calls `POST /tasks` with `runtime=cloud`.
3. Control plane schedules a microVM, injects repo + scoped token + tool allow-list.
4. Cloud agent executes; streams events over WSS to Command Center (and IDE).
5. On completion: PR opened, summary emitted, microVM torn down, usage events metered.

---

## 2. Repository Structure

**Monorepo** (single repo, workspace-managed). Rationale: 2–3 person team, shared types/protocol,
faster iteration. Bootstrapped = minimize infra overhead.

```
repo/
├── apps/
│   ├── desktop/            # VS Code fork (build scripts + our extensions/package)
│   ├── web/                # Next.js dashboard + softphone
│   └── tray-agent/         # Electron/Tauri tray app (local personal agent host)
├── services/
│   ├── control-plane/      # Auth, org, billing, usage, marketplace, webhooks (Node/Bun + TS)
│   ├── agent-control/      # Orchestrator, scheduler, checkpoint, swarm (Python)
│   ├── voice-control/      # Telephony adapter, realtime bridge, RAG (Python)
│   └── model-router/       # Provider adapters, routing policy, caching (Python)
├── runtimes/
│   ├── local-agent/        # Local agent runtime + skills host + heartbeat (TS, runs in tray)
│   └── cloud-agent/        # Cloud agent runtime image (Python, runs in microVM)
├── shared/
│   ├── agent-protocol/     # Canonical agent message/event schema (TS + Python codegen)
│   ├── skills-sdk/         # Skill authoring SDK + permission spec
│   └── ui-kit/             # Shared React components (web + desktop webviews)
├── infra/
│   ├── terraform/          # Cloud infra (K8s, Postgres, Redis, KMS, Twilio config)
│   ├── microvm/            # Firecracker/gVisor image build
│   └── voice-edge/         # Media edge deployment (mediasoup/Freeswitch)
├── packages/               # Internal libs (billing client, usage meter, observability)
├── docs/                   # Architecture, ADRs, decision log, runbooks
└── .devin/                 # Devin CLI config, skills, rules
```

**Workspaces:** npm/pnpm for TS apps; uv/poetry for Python services; shared `agent-protocol`
generates TS + Python bindings from a single schema (JSON Schema / Protobuf).

---

## 3. Data Model (core entities)

> Postgres (multi-tenant via `org_id` on every row) + pgvector for memory embeddings.
> Per-tenant encryption keys via KMS for sensitive fields.

```
org            (id, name, plan, billing_id, spend_cap_usd, created_at)
user           (id, org_id, role(owner|admin|member|billing), email, sso_subject)
seat           (id, org_id, user_id, status)
api_key        (id, org_id, user_id, scopes, hashed_secret, last_used)
byo_key        (id, org_id, provider, encrypted_key, label)        # user-supplied LLM keys

agent_template (id, org_id|global, name, role, system_prompt, tool_allowlist, model_policy)
agent_run      (id, org_id, user_id, task_id, runtime(local|cloud), status, started_at,
                ended_at, cost_usd, checkpoint_id, parent_run_id)
task           (id, org_id, user_id, title, spec, status, budget_usd, deadline,
                runtime_pref, repo_ref, created_at)
checkpoint     (id, agent_run_id, seq, state_blob_ref, fs_snapshot_ref, created_at)
usage_event    (id, org_id, agent_run_id, type(tokens|vm_hour|phone_min|number_day),
                units, cost_usd, ts)                               # → ClickHouse for aggregation
usage_counter  (org_id, type, period, used, cap)                   # real-time enforcement

memory_item    (id, org_id, scope(session|project|user|org), ref_id,
                kind(fact|doc|code|conversation), content, embedding, perms, ts)
project        (id, org_id, name, repo_url, index_state, sync_enabled)

skill          (id, publisher_id, name, version, manifest, permissions, signed_pkg_url,
                visibility(public|org|private), status, installs)
skill_install  (id, org_id, skill_id, agent_scope, granted_perms, installed_by, ts)

phone_number   (id, org_id, user_id, e164, region, provider, status)
call_session   (id, org_id, phone_number_id, direction, started_at, ended_at,
                status, transcript_ref, recording_ref, cost_usd, agent_run_id)
voicemail      (id, call_session_id, transcript, audio_ref, created_at)

webhook        (id, org_id, url, events, secret, status)
audit_log      (id, org_id, actor, action, target, detail, ts)     # immutable
```

**Encryption:** `byo_key.encrypted_key`, `memory_item.content` (sensitive), `call_session.transcript`
encrypted with tenant key. Embeddings stored unencrypted (low sensitivity) but tenant-scoped.

---

## 4. Agent Protocol (unified across local / cloud / voice)

A single canonical message schema so the orchestrator treats all agents uniformly. Defined in
`shared/agent-protocol/`, codegen to TS + Python.

### 4.1 Message types
- `task.start` — { task_id, spec, budget, deadline, runtime, tool_allowlist, model_policy, memory_scope }
- `task.plan` — { plan_steps[] } (agent proposes; human can approve for risky steps)
- `tool.call` — { tool, args, request_id } → `tool.result` — { request_id, output, error }
- `state.event` — { type(file_edit|shell|browser|git|message|call), summary, diff_ref }
- `checkpoint` — { seq, state_ref, fs_ref }
- `cost.tick` — { tokens_in, tokens_out, model, cost_usd } (→ metering)
- `human.checkpoint` — { reason, proposed_action, diff_preview } (blocks until approved)
- `task.complete` — { summary, artifacts[], pr_url?, cost_usd, duration }
- `task.failed` — { reason, partial_state_ref, cost_usd }

### 4.2 Tool interface
Every tool is a named capability with: `name`, `input_schema`, `output_schema`,
`permissions_required`, `side_effect` (none|read|write|destructive), `cost_estimate`,
`runtime` (local|cloud|either). The orchestrator enforces allow-lists per agent role + skill.

### 4.3 Voice-specific constraints
Voice agents use a **voice-safe tool subset**: only `side_effect ∈ {none, read}` tools execute
inline; any write/destructive tool requires explicit spoken consent → emits `human.checkpoint`
rendered as a yes/no voice prompt. Tool latency > 2s triggers a "let me check that" filler.

### 4.4 Checkpointing & replay
- Every agent run emits `checkpoint` events on a configurable cadence + before risky actions.
- Cloud runs: state + FS snapshot in object storage; can resume in a fresh microVM.
- Local runs: state in local DB; FS is the user's working tree (git-tracked for revert).
- Replay: rehydrate from checkpoint N, replay event stream, diverge from there.

---

## 5. API Surface

### 5.1 Control plane (REST + WSS)
- `POST /v1/auth/{google,github,email}`, `POST /v1/orgs`, `POST /v1/seats`
- `GET/POST /v1/byo-keys`, `GET/POST /v1/api-keys`
- `POST /v1/tasks` (create + schedule), `GET /v1/tasks/:id`, `POST /v1/tasks/:id/{pause,kill,redirect}`
- `WSS /v1/agent-streams/:task_id` (live events to clients)
- `GET/POST /v1/agents/runs`, `GET /v1/agents/checkpoints/:run_id`
- `GET/POST /v1/memory` (scoped query/insert), `DELETE /v1/memory/:scope/:id`
- `GET/POST /v1/skills`, `POST /v1/skills/:id/install`, `POST /v1/skills` (publish, reviewed)
- `GET/POST /v1/phone-numbers`, `POST /v1/calls/:id/transfer`, `GET /v1/calls`
- `GET /v1/usage`, `GET /v1/usage/events`, `POST /v1/credits/buy`
- `POST /v1/webhooks` (register), outbound webhooks on events
- `GET /v1/audit` (admin)

### 5.2 Agent runtime API (internal, mTLS between control plane ↔ runtimes)
- `POST /runtime/start`, `POST /runtime/{pause,resume,kill}`, `POST /runtime/tool/invoke`
- `WSS /runtime/events` (push state/cost/human-checkpoint up)

### 5.3 Local agent ↔ control plane
- Local agent authenticates with user API key; long-lived WSS for heartbeats + remote triggers.
- Cloud → local tool calls only through an explicit user-approved reverse tunnel (default off).

### 5.4 Voice
- Twilio webhooks → `voice-control` → realtime bridge (OpenAI Realtime / xAI) ↔ caller.
- `POST /v1/calls/:id/tools` invoked by realtime model → tool bus → result back to model.

---

## 6. Technology Stack (finalized)

| Layer | Choice | Why |
|---|---|---|
| Desktop IDE | **VS Code fork** (track upstream weekly) | Decision #9; full UX control |
| Desktop tray agent | **Tauri** (Rust shell + TS UI) | Lighter than Electron, secure, small binary |
| Web dashboard + softphone | **Next.js (App Router) + React + Tailwind** | Fast to ship, SSR, WebRTC in-browser |
| Control plane | **Bun + TypeScript + Hono** (or Node + Fastify) | Fast, modern, good DX; TS shared with clients |
| Agent control / orchestrator | **Python 3.12 + FastAPI** | ML/tooling ecosystem; provider SDKs mature |
| Model router | **Python + FastAPI** | Co-located with agent control or separate |
| Voice control | **Python + FastAPI + Twilio SDK** | Twilio maturity; realtime bridge via OpenAI/xAI SDKs |
| Local agent runtime | **TypeScript** (runs in Tauri) | Shares protocol types with clients |
| Cloud agent runtime | **Python** (in microVM image) | Same orchestrator protocol |
| DB | **Postgres 16 + pgvector** | Tenants + memory embeddings in one store |
| Cache/queue | **Redis 7** + **SQS/Redis Streams** | Sessions, rate limits, event bus |
| Usage metering | **ClickHouse** | High-volume event aggregation |
| Cloud agent isolation | **Firecracker microVMs** (AWS) | Strong isolation, fast boot; gVisor fallback |
| Voice media edge | **mediasoup** (WebRTC) + **Twilio SIP** PSTN | Regional SFU; Twilio for PSTN |
| Voice realtime | **OpenAI Realtime API + xAI** (launch) → self-host Deepgram/Whisper + ElevenLabs later | Decision #11 |
| Billing | **Stripe Billing** + internal meter | Subscriptions + invoiced overages + credits |
| Secrets | **AWS KMS** (per-tenant keys) + local OS keychain | Tenant isolation + local BYO-key safety |
| Observability | **OpenTelemetry → Grafana/Tempo/Loki** | Per-agent cost + trace attribution |
| Infra | **Terraform** + **Kubernetes (EKS)** | Reproducible; K8s for control plane; microVMs via flintlock/krata |
| CI/CD | **GitHub Actions** | Standard; build desktop + web + services |
| Schema/protocol | **JSON Schema → codegen TS+Py** | Single source of truth |

---

## 7. Security, Isolation & Privacy (detailed)

- **Multi-tenancy:** `org_id` mandatory on every DB row (enforced via ORM middleware + DB RLS
  policies as backstop). No cross-org queries; integration tests assert isolation.
- **Per-tenant keys:** KMS-generated data keys per org; envelope encryption for sensitive fields.
- **Cloud agent microVMs:** ephemeral, no persistent disk, no outbound network except the model
  router (allow-listed egress proxy). Per-task scoped token; token expires with task.
- **Local agent:** per-skill permission grants stored locally; user approves each new capability
  via OS-native prompt; full local audit log; global kill switch; sandboxed FS access via
  allow-listed paths; shell commands run through an allow-list + confirmation for destructive ops.
- **BYO-key:** keys encrypted at rest (tenant key), decrypted only in the model router process,
  never logged, never sent to any provider other than the named one.
- **Voice:** DTMF/SS7 hardening, per-number rate limits, A2P 10DLC registration, all-party
  consent for any recording (default off), abuse detection on outbound, KYC before number provisioning.
- **Audit:** immutable append-only audit log for every agent action, tool call, permission grant,
  billing event. User/admin can read; tamper-evident via hash chain.
- **Secrets in code:** none. All secrets via env/KMS/OS keychain. Pre-commit hook scans for secrets.
- **GDPR:** export endpoint (full org data dump) + delete endpoint (ALPHA + key destruction).

---

## 8. Billing & Usage Metering (detailed)

- **Metering pipeline:** every billable action emits a signed `usage_event` → Kafka/Redis Streams
  → ClickHouse. Aggregations feed `usage_counter` (real-time, Redis-backed) for enforcement and
  the dashboard. Stripe Billing handles subscription state; overages invoiced monthly from
  ClickHouse aggregates.
- **Credits:** pre-paid balance (cents) consumed before metered overages; bought in packs.
- **BYO-key:** token costs not metered by us (user pays provider directly); we meter only
  VM-hours, phone minutes, numbers, infra-derived costs. This is why BYO-key tiers can be cheap.
- **Enforcement:** soft alert at 80%, hard stop at 100% of cap (configurable per org). Cloud
  agent tasks refused at cap; voice calls routed to voicemail at minute cap.
- **Cost control:** Model Router picks cheapest model meeting policy; prompt caching; embedding
  cache; microVM idle reclamation at 5min; per-task hard budget (agent self-aborts at budget).

---

## 9. Voice Layer (detailed)

- **Provisioning:** Twilio numbers via `voice-control`; A2P 10DLC brand/campaign registration
  automated for orgs on paid plans.
- **Inbound call flow:** Twilio webhook → `voice-control` creates `call_session` → opens
  realtime session (OpenAI Realtime or xAI) → streams bidirectional audio via media edge →
  agent greets → conversation loop with tools + RAG.
- **RAG during call:** retrieve from `memory_item` (org scope) + connected KBs; injected as
  context to realtime model; results cited in transcript.
- **Tools during call:** voice-safe subset; destructive actions require spoken consent
  (`human.checkpoint` rendered as voice yes/no).
- **Outcomes:** call end → transcript + summary + any spawned tasks (e.g. "open a ticket") →
  emitted to orchestrator bus → Command Center + optional Slack/SMS.
- **Voicemail:** unanswered/after-cap → Twilio voicemail → transcription → stored → digest.
- **Concurrency:** per-org concurrent-call slots (plan-based + add-on); backpressure via
  regional media-edge capacity; queue + callback if exceeded.
- **Self-host migration (post-launch):** swap realtime bridge to Deepgram (ASR) + ElevenLabs
  (TTS) + our own LLM streaming; keep Twilio for PSTN. Adds voice cloning (consent-gated).

---

## 10. Marketplace (at-launch, curated)

- **Objects:** skills (tool bundles), agent templates (role+prompt+tools), voice personas.
- **Publishing:** submit → automated static analysis (perms, sandbox escapes) → human review
  (small team → slow; mitigate with strict schema + automated checks) → signed package.
- **Installation:** per-org; explicit permission grant re-confirmed at install; revocable.
- **Monetization:** paid skills (one-time or subscription) with platform take rate (e.g. 20%);
  rev-share monthly via Stripe Connect.
- **Risk:** abuse via malicious skills. Mitigation: permission model, sandboxing, signed
  packages, kill-switch, reputation scores, prompt reporting.

---

## 11. Implementation Order (2–3 person team, bootstrapped, all-four-at-launch)

Sequenced to produce a chargeable paid beta as early as possible while building toward full
convergence. Each milestone ends with something demoable + chargeable.

### M0 — Foundations (weeks 1–3)
- Monorepo, CI, infra skeleton (Terraform: VPC, EKS, Postgres, Redis, KMS).
- `shared/agent-protocol` schema + codegen.
- Control plane: auth, org, seats, BYO-key, basic usage meter (no billing yet).
- Model router: Anthropic + OpenAI adapters (xAI + Google next).

### M1 — Coding IDE (local) (weeks 4–8) → **first chargeable beta**
- VS Code fork build pipeline + our extension package.
- Local agent runtime (TS) + tool bus (file/shell/git/search).
- ALPHA-style command center panel in IDE.
- Memory service (local cache + cloud sync on by default).
- Stripe Billing: Free + Pro (BYO-key-first, low price).
- **Chargeable beta opens:** coding IDE + local agent, Pro tier.

### M2 — Local personal agent + messaging (weeks 9–13)
- Tauri tray app hosting the local runtime.
- Heartbeat scheduler; proactive actions.
- Skills system + SDK + 3–5 starter skills.
- Messaging integrations: Slack + SMS (Twilio) + Email.
- Skills marketplace (curated, at-launch per decision #14).

### M3 — Cloud autonomous agents (weeks 14–20)
- Firecracker microVM provisioning; cloud agent runtime image.
- Checkpointing + replay; PR generation (GitHub).
- Command Center: local + cloud unified; swarm orchestration.
- Cloud-VM-hours metering + add-on billing.
- xAI + Google adapters in model router.

### M4 — Voice + phone (weeks 21–28)
- Twilio integration; number provisioning; A2P 10DLC.
- `voice-control` + realtime bridge (OpenAI Realtime + xAI).
- Media edge (mediasoup); browser softphone in web dashboard.
- RAG during call; voice-safe tools; voicemail + transcripts.
- Phone-minute/number metering + add-on billing.
- **Full convergence GA:** all four surfaces, US/CA phone.

### M5 — Web dashboard + hardening (weeks 29–33, parallel with M3–M4)
- Next.js dashboard: Command Center, usage, billing, admin, marketplace, softphone.
- Observability dashboards; audit log UI; GDPR export/delete.
- Load testing; cost-control tuning; security review.

> **Total to full GA: ~28–33 weeks (~7–8 months)** for a 2–3 person team. Revenue starts at M1
> (~week 8) via paid beta — critical for bootstrapped survival. This is aggressive but staged
> so each milestone ships chargeable value.

---

## 12. Open design questions for human (smaller, post-approval)

1. **Bun vs Node/Fastify** for control plane — Bun is faster but younger; OK to default to Bun?
2. **Tauri vs Electron** for tray — Tauri is lighter but Rust toolchain adds friction; OK?
3. **Firecracker vs gVisor** for cloud isolation — Firecracker stronger but more ops; start with
   gVisor (simpler) and migrate? Or commit to Firecracker?
4. **Marketplace review staffing** — at-launch marketplace with a 2–3 person team means slow human
   review; rely heavily on automated analysis + limit initial third-party publishing to invited
   authors? (Recommended.)
5. **Web dashboard framework** — Next.js App Router confirmed, or prefer Remix/Vite?

These can be defaulted by me (I'll pick the pragmatic option) unless you object.

---

## 13. What I will NOT do without further confirmation
- Write production code (any language).
- Create/scaffold the actual git repository.
- Provision real cloud infra or Twilio accounts.
- Register domains or trademarks.

## ✋ STOPPING for technical-design approval
Please review this design and either approve (I'll then start with repo scaffolding + M0
foundations, confirming the small defaults in §12) or request changes.
