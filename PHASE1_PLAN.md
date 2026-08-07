# Phase 1 — Planning Document
# Project: "Cascade" (working name) — Commercial Agentic Dev Platform + Personal Agent + Phone AI

> **Phase 0 rule in effect:** No production code, repository scaffolding, or implementation
> until this document is reviewed, open questions answered, and explicit approval given.

---

## 1. Vision & Core Value Proposition

### What it is
A single commercial product that fuses four capabilities that today live in separate tools:

1. **Agentic coding environment** (Windsurf / Claude Code / Cursor / Bolt.new / Lovable class)
   — deep codebase understanding, multi-file planning, autonomous task execution, PR generation.
2. **Cloud autonomous engineer** (Devin class) — long-running agents in sandboxed cloud VMs
   with computer use, capable of taking a ticket to a merged PR while you sleep.
3. **Local-first personal agent runtime** (OpenClaw class) — a persistent agent on your own
   machine with skills, proactive heartbeats, messaging integrations (Slack/WhatsApp/SMS/Email),
   and controlled access to your local system.
4. **Real-time voice + phone answering service** (xAI-style) — dedicated phone numbers,
   SIP/WebRTC telephony, speech-to-speech agents that answer calls, retrieve knowledge, and
   trigger coding/personal tasks.

All behind one account, one billing relationship, one identity/memory layer — sold as a paid SaaS.

### Who it is for
- **Primary:** Indie developers & small teams (1–20 ppl) who already pay for Cursor/Windsurf/Claude
  and want *more* — autonomy, a personal agent that actually does things, and a phone line their
  AI answers.
- **Secondary:** Agencies & consultancies that want to resell AI dev capacity + an AI front-desk
  / phone agent to their clients.
- **Tertiary:** Solo founders / non-technical operators who want an AI that builds their product
  *and* handles their calls/messages.

### Why customers pay for this instead of the references
The reference products each own one axis. None own all four, and none unify identity/memory
across "the thing that writes my code," "the thing that runs my life," and "the thing that
answers my phone." The wedge is **convergence + continuity**:

- vs **Cursor/Windsurf/Claude Code:** They stop at the editor. We extend the same agent into
  cloud autonomy, personal automation, and voice — one subscription, not three.
- vs **Bolt.new/Lovable:** They are browser-only, ephemeral, no local system access, no phone,
  no persistent personal agent. We offer durable local + cloud + voice.
- vs **Devin:** Devin is cloud-only, coding-only, expensive, and has no personal-agent or phone
  layer. We offer a local runtime and a voice surface at a more accessible price.
- vs **OpenClaw:** OpenClaw is local-first but not a commercial multi-tenant SaaS, has no coding
  IDE, no cloud VM autonomy, and no telephony. We productize and monetize the same philosophy.

**One-line pitch:** *"The AI that writes your code, runs your life, and answers your phone —
one account, one bill, your data stays yours."*

---

## 2. Detailed Feature Breakdown

### 2.1 Core coding agent capabilities
- Deep codebase indexing & semantic retrieval (repo graph, symbol table, embeddings).
- Multi-file planning: task → plan → diff preview → execute → verify (test/lint/build loop).
- Inline agentic IDE (VS Code fork or extension) with Cascade-style command center.
- Tool use: file edit, shell, browser, search, git, test runner, package manager.
- Model routing: support multiple providers (Anthropic, OpenAI, xAI, Google, local/Ollama).
- Long-context + memory of past sessions per repo.
- Human-in-the-loop checkpoints; transparent diff review; one-click revert.
- "Ship it" path: branch → commit → PR → CI → (optional) auto-merge on green.

### 2.2 Multi-agent orchestration & Command Center
- Dashboard of running agents (local + cloud) with live status, logs, cost, interventions.
- Agent roles: Coder, Reviewer, Planner, Researcher, QA, Ops — assignable per task.
- Hierarchical orchestration (lead agent delegates subtasks) and parallel swarms.
- Shared workspace/context bus; agents can hand off artifacts.
- Kill/pause/redirect any agent; replay from checkpoint.
- Per-agent spend caps and time limits.

### 2.3 Local personal-agent runtime (OpenClaw-style)
- Persistent agent process on user's machine (Windows/macOS/Linux tray app).
- Skills system: installable, declarative skill packages (YAML/TS) with tool permissions.
- Proactive "heartbeat" scheduler — agent initiates actions on a cron/event basis.
- Sandboxed local system access (explicit per-skill permission grants; allow-listed paths/commands).
- Local memory store + optional encrypted sync to cloud.
- Works offline for non-LLM-heavy tasks; falls back to local models when configured.

### 2.4 Messaging & proactive automation
- Integrations: Slack, Discord, WhatsApp, SMS (Twilio), Email (IMAP/SMTP), Telegram.
- Bidirectional: agent reads + responds; can initiate outbound messages on schedule/events.
- Triggers: incoming message, webhook, schedule, file change, CI event, phone-call outcome.
- Notification & digest engine; quiet hours; per-channel opt-in.
- "Inbox" view in the product UI consolidating all agent comms.

### 2.5 Real-time voice + phone answering service
- Dedicated phone numbers per user/org (provisioned via Twilio/Vonage).
- SIP + WebRTC; browser-based softphone + PSTN termination.
- Real-time speech-to-speech pipeline: ASR → LLM (with tools/knowledge) → TTS, sub-800ms target.
- Interruption/barge-in; barge-out; transfer to human; voicemail + transcription.
- Knowledge retrieval (RAG over user docs/CRM/calendar) during calls.
- Call tools: book meeting, create task, query status, log to CRM, trigger a coding/personal agent.
- Concurrent call capacity as a billable dimension; per-minute metering.
- Voice cloning (optional, consent-gated) for branded agents.

### 2.6 Commercial SaaS layer
- Accounts: email + OAuth (Google/GitHub), SSO/SAML for teams.
- Organizations, teams, seats, roles (owner/admin/member/billing).
- Subscription billing (Stripe) — tiers + usage add-ons + credits.
- Usage metering & limits: LLM tokens, agent-minutes, cloud-VM-hours, phone-minutes, numbers.
- Admin console: members, spend caps, audit logs, data residency, API keys.
- Web dashboard + desktop app + (later) mobile companion.
- Marketplace for skills/agent-templates/voice-personas (rev-share, platform take rate).
- API & webhooks for third-party integrations.

### 2.7 Cross-cutting concerns
- **Memory:** hierarchical (session → project → user → org); vector + structured; user-owned.
- **Skills system:** unified across coding/personal/voice agents; permission-scoped; signed packages.
- **Security:** least-privilege tool execution, secret vault, audit log of every agent action.
- **Observability:** traces, spans, cost attribution per agent/task; OpenTelemetry-compatible.
- **Multi-tenancy:** strict isolation per org; per-tenant encryption keys; no cross-org data.
- **Model portability:** BYO-key support (bring your own Anthropic/OpenAI key) + managed keys.
- **Compliance:** GDPR/CCPA data export/delete; SOC2 roadmap; HIPAA-eligible voice tier (later).

---

## 3. Business & Monetization Model

### 3.1 Target segments & willingness to pay
| Segment | Need | WTP/mo | Volume |
|---|---|---|---|
| Indie / solo dev | Coding + personal agent | $20–40 | high |
| Power user / freelancer | + phone agent, cloud autonomy | $40–80 | medium |
| Small startup (2–20) | Seats + shared memory + phone | $80–400 | medium |
| Agency / consultancy | Resell capacity, white-label voice | $500–5k | low, high ACV |
| Enterprise | SSO, audit, data residency, SLA | custom | low, highest ACV |

### 3.2 Pricing model (hybrid: subscription + usage add-ons + credits)
Inspired by Cursor ($20/$40), Windsurf, Bolt/Lovable (credits/usage), Devin (high ACV), and
telephony (per-minute). Proposed tiers (list, USD/month, billed monthly):

- **Free** — $0. Local IDE agent with BYO-key only, 1 local personal agent, no phone, no cloud VM,
  community skills. Existence proof + funnel. Hard usage caps.
- **Pro** — $29/mo. Managed LLM credits (e.g. ~$20 cost-equivalent), 1 local + 1 cloud agent,
  messaging integrations, 1 phone number + 100 call-minutes/mo, priority queues.
- **Team** — $39/seat/mo (min 3 seats). Shared org memory, roles/admin, 3 cloud agents/seat,
  1 phone number/org + 250 min/seat, spend caps, audit logs, SSO-lite.
- **Business** — $99/seat/mo. Unlimited cloud agents (fair-use), 1 number/seat, 1k min/seat,
  white-label voice persona, API access, data residency (US/EU), SOC2 controls.
- **Enterprise** — custom. SAML, SLA, dedicated infra option, HIPAA voice, on-prem agent runtime,
  custom contracts.

**Add-ons (metered, billable on top of any paid tier):**
- Cloud-VM agent-hours (beyond plan): ~$0.20/agent-hour
- Phone minutes beyond plan: ~$0.03/min (US/CA), intl at cost + margin
- Extra phone numbers: $2/number/mo
- LLM credit top-ups: 1 credit = $0.01 of model spend, sold in packs
- Concurrent call capacity: $10/mo per extra concurrent call slot

### 3.3 What is gated behind paid plans
- Cloud autonomous agents (Devin-style VMs): **paid only** (cost driver).
- Dedicated phone numbers + inbound voice: **paid only**.
- Managed LLM keys (no BYO): **paid only**.
- Team/admin/SSO: **Team+**.
- White-label voice, API, data residency: **Business+**.
- Free tier is genuinely useful but capped to prevent abuse and cost blowup.

### 3.4 Phone/voice-specific monetization
- Numbers and minutes are pure pass-through-cost + margin (Twilio ~$1.15/number, ~$0.008–0.013/min
  US). We mark up minutes ~2–3x and numbers ~1.7x. Voice is high-margin *and* a sticky retention
  hook (your number is printed on your business card).
- Concurrent-call capacity is the real scaling lever for businesses — sold as slots.
- Premium voice personas / cloned voices: $20/mo/persona (Business+).

### 3.5 Team/org features & pricing
- Per-seat model with org-level pooled resources (minutes, VM-hours, credits) — simpler than
  per-seat hard quotas and encourages seat growth.
- Admin spend caps prevent runaway costs; alerts at 50/80/100%.
- Shared memory + skills library per org; private agent templates.

### 3.6 Unit economics (rough, per active paid user, monthly)
| Cost item | Pro | Team/seat | Business/seat |
|---|---|---|---|
| LLM inference (managed) | $8–14 | $12–20 | $25–45 |
| Cloud VM agent-hours | $2–5 | $4–10 | $10–25 |
| Telephony (numbers+min) | $2–4 | $3–6 | $8–15 |
| Infra (indexing, memory, observability) | $3 | $4 | $8 |
| Support/COGS overhead | $2 | $3 | $5 |
| **Total COGS** | **~$17–28** | **~$26–43** | **~$56–98** |
| Price | $29 | $39 | $99 |
| **Gross margin** | **~30–40%** | **~0–30%** | **~0–40%** |

> ⚠️ **Honest assessment:** Pro/Team margins are thin because LLM + VM costs are high. Profitability
> depends on (a) BYO-key users (zero LLM COGS for us), (b) usage caps + fair-use enforcement,
> (c) negotiating volume discounts with model providers, and (d) voice/numbers being high-margin
> attach. Team/Business need seat volume and add-on spend to be healthy. This is the **biggest
> commercial risk** — see §8.

### 3.7 Go-to-market & positioning
- **Wedge:** Launch with the *coding IDE + local personal agent* (Pro tier) — lowest COGS, proven
  demand, fast to ship. Voice and cloud autonomy come as paid add-ons/upsell.
- **Channels:** Developer Twitter/X, YouTube build-alongs, HackerNews launch, dev podcast ads,
  Cursor/Windsurf comparison content, "AI answered my phone" viral demos.
- **Positioning:** "One AI for your code, your life, and your calls." Differentiate on
  *convergence + local-first privacy + voice*, not on raw coding benchmarks (we won't win those
  alone vs Cursor).
- **Expansion:** Skills marketplace + agency reseller program (white-label voice) for B2B.
- **Retention hooks:** Your phone number, your agent memory, your skills — all portable-but-sticky.

---

## 4. Architecture Proposal

### 4.1 High-level architecture (described)
```
┌─────────────────────────────────────────────────────────────────────┐
│  CLIENTS:  Desktop app (IDE + tray agent) │ Web dashboard │ Softphone│
└───────────────┬───────────────────────────────┬──────────────────────┘
                │ (TLS, wss)                     │ (SIP/WebRTC via media edge)
┌───────────────▼───────────────────────────────▼──────────────────────┐
│  CONTROL PLANE (multi-tenant SaaS, cloud)                            │
│  - Auth/Org/Billing/Usage metering   - Skill/Agent-template registry │
│  - Memory service (vector+structured, per-tenant keys)               │
│  - Orchestration/Command Center API   - Webhooks/Integrations hub    │
│  - Observability (traces/spans/cost)  - Telephony control (Twilio)   │
└───────┬──────────────────┬───────────────────────┬───────────────────┘
        │                  │                       │
┌───────▼───────┐  ┌───────▼────────┐  ┌───────────▼────────────┐
│ LOCAL AGENT   │  │ CLOUD AGENT    │  │ VOICE MEDIA EDGE       │
│ RUNTIME       │  │ RUNTIME        │  │ (per-region, SFU+media)│
│ (user machine)│  │ (sandboxed VMs │  │ ASR ↔ LLM ↔ TTS stream │
│ skills, hb,   │  │  per task)     │  │ tools, RAG, barge-in   │
│ local tools   │  │ computer use   │  │                        │
└───────────────┘  └────────────────┘  └────────────────────────┘
        │                  │                       │
        └──────────┬───────┴───────────────────────┘
                   ▼
        ┌──────────────────────┐    ┌─────────────────────┐
        │ MODEL ROUTER         │───▶│ LLM PROVIDERS       │
        │ (cost/latency/policy)│    │ Anthropic/OpenAI/   │
        │ BYO-key or managed   │    │ xAI/Google/local    │
        └──────────────────────┘    └─────────────────────┘
```

### 4.2 Local vs cloud — decisions & justification
- **Local:** IDE, personal-agent runtime, local tools, local memory cache, local model option.
  Rationale: privacy, low latency for interactive coding, offline-capable personal agent,
  zero LLM COGS when BYO-key/local model.
- **Cloud:** Control plane, memory-of-record (encrypted), cloud agent VMs, voice media edge,
  telephony, billing, integrations hub. Rationale: multi-tenancy, durability, telephony needs
  public endpoints, long-running VMs need always-on infra.
- **Interaction:** Local agent authenticates to control plane; syncs memory (encrypted); can
  *request* a cloud VM for long tasks; receives webhooks/heartbeats. Cloud agents can call back
  into local tools only via an explicit, user-approved tunnel (default off).

### 4.3 Multi-tenant SaaS architecture
- Single control-plane deployment, logical multi-tenancy via org_id on every record.
- Per-tenant encryption keys (KMS-managed); memory & logs encrypted at rest with tenant keys.
- Strict row-level isolation; no shared mutable state across orgs.
- Optional dedicated infra (Business/Enterprise): single-tenant control-plane slice + dedicated
  voice edge for data residency.

### 4.4 Agent runtime model
- **Hybrid hierarchical + swarm.** A lead "orchestrator" agent per task decomposes into subtasks,
  delegates to specialized role agents (Coder/Reviewer/QA/Researcher), can fan out parallel work.
- Local and cloud agents share the same agent protocol & skill interface; location is a
  deployment detail. The Command Center treats them uniformly.
- Long-running cloud agents are checkpointed (state + filesystem snapshot) so they can be paused,
  resumed, migrated, and replayed.

### 4.5 Shared context/memory across coding & personal & voice
- Unified **Memory Service** with scopes: session < project < user < org.
- Both code semantics (repo graph, embeddings) and personal facts (contacts, preferences,
  calendar) live in the same store, scoped and permission-tagged.
- A phone call can read project status; a coding agent can read your calendar to know you're in
  a meeting. Cross-domain continuity is the core differentiator — but access is **explicit and
  auditable** per skill/agent.

### 4.6 Phone/voice layer integration
- **Telephony:** Twilio (primary) for numbers + PSTN; Vonage as fallback. SIP trunking for
  enterprise BYO-carrier.
- **Media edge:** regional WebRTC/SIP media servers (mediasoup/Freeswitch) doing ASR↔LLM↔TTS
  streaming with barge-in. LLM via the same Model Router (prefer low-latency xAI/OpenAI
  realtime or Anthropic for tool-heavy calls).
- **Tools during call:** same skill/tool protocol as other agents, but with a "voice-safe"
  allow-list (fast, side-effect-light tools; confirm before destructive actions).
- **Call → task bridge:** call outcomes emit events into the orchestration bus, triggering
  coding/personal agents (e.g. "caller wants bug X fixed" → opens a cloud agent task).

### 4.7 Technology stack recommendations (proposed, not final)
- **Desktop/IDE:** VS Code fork (or extension) + Electron tray app; TypeScript/React.
- **Control plane:** TypeScript (Node or Bun) or Go; Postgres (tenants) + pgvector; Redis;
  Kafka/SQS for event bus; Kubernetes for cloud agent VMs.
- **Agent runtime:** Python (for ML/tooling ecosystem) + TS shim for IDE-local; OpenAI Agents /
> LangGraph / custom thin orchestrator (decision pending — see open questions).
- **Cloud agent VMs:** Firecracker microVMs or gVisor containers for isolation; per-task ephemeral.
- **Voice:** mediasoup or Freeswitch media edge; Deepgram/Whisper ASR; ElevenLabs/PlayHT/OpenAI
  TTS; realtime LLM endpoints.
- **Billing:** Stripe Billing + self-hosted usage meter (ClickHouse for event aggregation).
- **Observability:** OpenTelemetry → Grafana/Tempo/Loki; per-agent cost attribution.

### 4.8 Isolation, security, data privacy
- Cloud agent VMs: ephemeral, no network egress except allow-listed, no access to other tenants.
- Local agent: per-skill permission grants; sandboxed FS/cmd access; user approves every new
  capability; full local audit log the user can read.
- Voice: DTMF/SS7 hardening, per-call rate limits, abuse detection, consent recording for calls.
- Secrets: per-tenant vault; agents get short-lived scoped tokens, never raw keys.
- Data privacy: local-first memory option (cloud sync off); BYO-key means prompts never touch
  our managed inference; GDPR export/delete; data residency for Business+.

### 4.9 Billing & usage metering architecture
- Every billable event (token, agent-minute, VM-hour, phone-minute, number-day) emitted as a
  signed event to the metering pipeline → ClickHouse → aggregated to usage counters per org/seat.
- Real-time counters feed the Command Center (live spend) and enforcement (caps + hard stops).
- Stripe Billing for subscription + invoiced overages; credits as pre-paid balance consumed first.

### 4.10 Scalability & cost control
- Cloud agent VMs autoscaled with spot/preemptible capacity; idle reclamation.
- Model Router picks cheapest model that meets a quality/latency policy per task; caching of
  embeddings/retrieval; prompt compression.
- Hard per-org spend caps + soft alerts; free-tier IP/identity-throttled to limit abuse.
- Voice concurrency scaled by region; backpressure when ASR/TTS capacity near limit.

---

## 5. User Experience Flows

### 5.1 Onboarding & starting a paid subscription
1. Sign up (Google/GitHub/email) → create personal org.
2. Download desktop app; optional: connect local repo folder.
3. Guided tour: run a coding task in the IDE; install a starter skill; (paid) claim a phone number.
4. Hit a free-tier cap → contextual upgrade sheet showing Pro/Team with usage so far.
5. Add payment (Stripe); immediate provisioning of managed credits + phone number + cloud agent.

### 5.2 Complex coding task → local → cloud handoff
1. User asks IDE agent: "Refactor auth to use passkeys across the monorepo."
2. Local agent plans, shows diff preview for first file, edits locally, runs tests.
3. Task is large → agent proposes "Hand off to a cloud agent with a VM to run the full build
   suite and open a PR." User approves (cost estimate shown).
4. Cloud VM spins up, clones repo, executes multi-file plan, runs CI, opens PR, posts summary
   to Command Center and (optionally) Slack.
5. User reviews PR from IDE or web; merges; cloud VM tears down.

### 5.3 Managing multiple agents in Command Center
- Grid of agent cards: status, elapsed time, cost, last action, [Pause][Redirect][Kill].
- Filter by local/cloud/role/project; click into a card for live log + diff stream.
- Create a swarm: "3 coders + 1 reviewer on repo X, budget $5, deadline 2h."

### 5.4 Interacting with personal agent via chat / messaging / phone
- **Chat:** in-app or desktop tray; same memory as coding agent.
- **Messaging:** DM the agent on Slack/WhatsApp; it responds or defers to quiet hours.
- **Phone:** call your number → voice agent answers, greets, uses RAG to answer, can book/log/trigger.

### 5.5 Incoming phone call triggering a coding/personal task
1. PSTN call → voice edge → ASR stream → agent greets.
2. Caller: "Did the deploy go out? If not, roll back and open a ticket."
3. Agent queries deploy status (tool), confirms not deployed, asks consent to roll back.
4. Consent → agent emits task event → cloud agent runs rollback + opens ticket.
5. Agent confirms to caller, offers to text summary; call ends; transcript + task logged.

### 5.6 Team collaboration & admin
- Owner invites seats; assigns roles; sets org spend cap.
- Shared memory namespace; private namespaces per member.
- Admin sees aggregate usage, audit log, per-seat breakdown.
- Shared agent templates & skills library; permissions on who can publish org-wide.

### 5.7 Usage limits & upgrade prompts
- Live usage bar in app (tokens/VM-hours/minutes).
- At 80%: in-app toast + email. At 100%: hard stop with upgrade sheet or buy-credits button.
- Free tier: daily caps reset at midnight UTC; persistent banner explaining paid benefits.

---

## 6. Open Questions & Decisions Required from Human

Ranked by importance (1 = blocks starting design).

1. **Scope priority for MVP.** Which of {coding IDE, local personal agent, cloud autonomous
   agent, voice/phone} must be in the *chargeable MVP*? (My recommendation: coding IDE + local
   personal agent + managed credits, with voice as the first paid upsell. Cloud autonomy second.)
2. **Local-first vs cloud-first priority.** Do we lead with the local desktop app (privacy wedge,
   low COGS) or the cloud web product (faster onboarding, broader reach)?
3. **Pricing direction.** Accept the thin-margin hybrid model in §3, or lean harder on BYO-key
   (lower COGS, lower revenue) / credits-only / higher list prices?
4. **LLM providers to support first.** Which of Anthropic / OpenAI / xAI / Google / local-Ollama
   for managed keys at launch? (Affects cost, latency, voice realtime options.)
5. **Phone number strategy & geography.** US/CA only at launch, or EU too? Twilio-only or
   multi-carrier? Bring-your-own-carrier for enterprise from day one?
6. **Compliance/legal stance at launch.** SOC2 from day one (delay launch ~3mo) or post-launch?
   HIPAA voice tier in scope for V1 or later? Call-recording consent model (opt-in all parties)?
7. **IDE approach.** Fork VS Code (heavy, full control) vs build a VS Code extension (lighter,
   faster, less control)? Strong opinion either way?
8. **Agent orchestration framework.** Build a thin custom orchestrator, or adopt OpenAI Agents
   SDK / LangGraph / CrewAI? (Affects velocity, lock-in, hiring.)
9. **Open-source strategy.** Any part open-sourced (e.g. local runtime, skills format) to build
   community/marketplace, or fully closed?
10. **Voice realtime stack.** Use a managed realtime API (OpenAI Realtime / xAI) end-to-end, or
    self-host ASR/TTS for cost control + voice cloning? Trade-off: latency vs margin vs features.
11. **Memory/cloud-sync default.** Default cloud-sync on (better UX, more COGS, more retention)
    or off-by-default (privacy-first, less COGS)?
12. **Marketplace timing.** Skills/voice-persona marketplace at V1 or V2? Rev-share rate?
13. **Funding/runway constraints.** Bootstrapped (forces profitability-first, thinner MVP) or
    funded (allows loss-leading growth)? Affects pricing & roadmap aggressiveness.
14. **Brand/name.** "Cascade" is a placeholder (conflicts with Windsurf's feature). Final name?
15. **Team/hiring.** Solo + contractors, or a founding team? Affects what we can build by when.

---

## 7. Risks, Hard Problems & Mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| **Thin/negative gross margins** on managed LLM + VM costs | Critical | BYO-key tier, hard caps, model router cost policy, prompt caching, fair-use, volume discounts, voice/numbers as high-margin attach |
| **Long-running agent reliability** (drift, loops, broken state) | Critical | Checkpointing, time/budget caps, human checkpoints, reviewer agent, replay-from-checkpoint, observability |
| **Computer-use reliability** in cloud VMs (Devin-class hard) | High | Constrain to CLI/IDE/git first (deterministic); browser/computer-use as opt-in beta; screenshot+plan loop with verification |
| **Real-time voice latency + tool calling** | High | Regional media edge, streaming ASR/TTS, barge-in, fast realtime LLM, pre-warmed pools, "let me check that" filler to mask tool latency |
| **Local system access security** (malicious skill, data exfil) | High | Per-skill permission grants, allow-listed paths/cmds, sandboxing, signed skill packages, local audit log, kill switch |
| **Multi-tenant isolation breach** | Critical | Per-tenant encryption keys, row-level isolation, ephemeral VMs, no egress, pen-test + SOC2 |
| **Cost explosions** (runaway agent, infinite loop) | High | Hard per-task & per-org spend caps, real-time metering with hard stops, idle reclamation |
| **Phone abuse** (spam, fraud, robocalling via our numbers) | High | KYC on number provisioning, A2P 10DLC compliance, rate limits, abuse detection, fast suspend |
| **Telephony compliance** (TCPA, consent, recording laws) | High | Default no-recording; opt-in all-party consent; geo-aware rules; legal review pre-launch |
| **Model provider dependency/price changes** | Medium | Model Router abstraction; multi-provider; local model fallback; BYO-key |
| **Competitive compression** (Cursor/Windsurf add voice/personal agent) | Medium | Move fast on convergence wedge; voice + local privacy as moats; marketplace network effects |
| **Support load from autonomous agents doing wrong things** | Medium | Transparency/revert, checkpoints, clear diffs, in-product undo, good defaults |
| **Voice cloning abuse / deepfake risk** | Medium | Consent-gated, watermarked, identity verification, deny non-self clones |
| **Legal: who is liable when an agent breaks a production system** | Medium | Clear ToS, human-in-loop defaults for prod, audit logs, insurance |

---

## 8. Phased Delivery Roadmap

### MVP — "Chargeable wedge" (target: ~3–4 months to paid launch)
**In scope:** Coding IDE agent (extension, not fork) + local personal-agent runtime + managed LLM
credits + Pro/Free billing + basic Command Center (local agents only) + 2–3 starter skills.
**Out of scope:** Cloud autonomous VMs, voice/phone, team/admin, marketplace.
**Success criteria:** 100 paying Pro users within 60 days of launch; NPS ≥ 40; gross margin ≥ 35%
on Pro (via BYO-key mix + caps); a user can complete a real multi-file refactor end-to-end.

### V1 — "Convergence" (~+4 months)
**In scope:** Cloud autonomous agents (Devin-style VMs, PR generation) as paid add-on; phone
answering service (US/CA, 1 number + minutes on Pro+); messaging integrations (Slack, SMS,
Email); Team tier with admin/roles; shared org memory; full Command Center (local+cloud).
**Success criteria:** 1k paying users, ≥25% on Team+; voice attach ≥30% of paid; cloud-agent
tasks → merged PR ≥60% success; SOC2 Type 1 in progress.

### V2 — "Scale & platform" (~+6 months)
**In scope:** Skills/voice-persona marketplace with rev-share; Business tier (data residency,
API, white-label voice); enterprise SSO/SAML/SLA; HIPAA-eligible voice tier; mobile companion;
swarm orchestration; agency reseller program.
**Success criteria:** 10k paying users, ≥3 enterprise logos; marketplace ≥200 skills; gross
margin ≥45% blended; SOC2 Type 2.

> Roadmap assumes a small team (2–4 engineers + 1 design/product). If solo/contractor, multiply
> timelines ~1.5–2x. Timelines are deliberately not given as fixed dates — see open question 13.

---

## 9. Success Metrics

**Product:**
- Multi-file task completion rate (end-to-end, no human fix) — target ≥70% by V1.
- Cloud-agent task → merged-PR rate — target ≥60%.
- Voice call resolution without human handoff — target ≥70%.
- DAU/MAU of desktop app — target ≥40%.
- Skills installed per active user — target ≥3.

**Technical:**
- Voice end-to-end latency p95 < 800ms (first response), < 500ms (barge-in).
- Agent checkpoint/replay success ≥99.5%.
- Multi-tenant isolation: zero cross-tenant data events (SLO = 0).
- Cost-per-paid-user trending down quarter over quarter.

**Business:**
- MRR growth; ARPU; gross margin % (target ≥45% blended by V2).
- Free→Paid conversion ≥3%; Paid→Team upgrade ≥20%.
- Voice attach rate among paid ≥30%.
- Net revenue retention ≥110% (expansion via seats + usage).
- Churn <5% monthly for paid.

---

## ✋ END OF PHASE 1 — STOPPING FOR APPROVAL

Per the Phase 0 rule, **no code, repository scaffolding, or implementation will begin** until you:
1. Review this document,
2. Answer the open questions in §6 (at minimum #1–#6), and
3. Give explicit approval (or a revised scope).

Please respond with feedback, answers to the open questions, and a clear "go" (or revisions)
before Phase 2 begins.

---

## APPENDIX A — Human Decisions (recorded 2026-08-07)

| # | Decision | Choice | Implications |
|---|---|---|---|
| 1 | MVP scope | **All four at launch** (coding IDE + local agent + cloud autonomy + voice/phone) | Highest-risk, longest time-to-revenue path. Requires telephony/compliance work + cloud VM infra + IDE + local runtime all before paid launch. Strongly differentiates on launch but demands more team/funding and careful sequencing. Roadmap in §8 must be revised — see Appendix B. |
| 2 | Local vs cloud | **Both desktop + web simultaneously** | Matches convergence pitch; ~1.5–2x the frontend/build effort; shared control plane + agent protocol makes this feasible but not free. |
| 3 | Pricing | **Lean BYO-key, lower list prices** | Near-zero LLM COGS for BYO-key users → healthy margins even at low prices. Managed-key path becomes a paid upsell, not the default. Lower ARPU, faster growth, weaker revenue floor. Revise §3 tiers downward. |
| 4 | LLM providers | **All four: Anthropic, OpenAI, xAI, Google** | Model Router must support all from day one. Voice realtime likely via OpenAI Realtime + xAI; coding via Anthropic + OpenAI; long-context via Google. More integration work, more provider-side risk surface. |
| 5 | Funding | **Bootstrapped** | Must reach revenue fast, low burn tolerance. Forces staging within launch (see Appendix B). |
| 6 | Team | **2–3 person founding team** (trimmed from "larger" to reconcile with bootstrapped) | Sequencing must be tight; parallelize carefully. |
| 7 | Compliance | **Lean, post-launch** | ToS + all-party consent recording + GDPR export/delete at launch. SOC2/HIPAA deferred. Locks out enterprise/healthcare initially — acceptable for bootstrapped wedge. |
| 8 | Phone geography | **US/CA only at launch** (trimmed from multi-region to reconcile) | Simplest compliance (TCPA, A2P 10DLC), fastest. EU/UK/AU post-launch. |
| 9 | IDE approach | **Fork VS Code** (Cursor/Windsurf-style) | Full control of UX, command center, branding. Heavy maintenance burden tracking upstream VS Code releases — needs a dedicated rebase cadence. |
| 10 | Orchestration | **Custom thin orchestrator** on top of provider agent SDKs | Most control, multi-provider routing freedom, no framework lock-in. Most build effort; must build checkpointing/state/replay ourselves. |
| 11 | Voice stack | **Managed realtime APIs at launch (OpenAI Realtime + xAI), self-host ASR/TTS post-launch as volume justifies** | Fastest to ship, lowest latency now; migrate to self-hosted Deepgram/Whisper + ElevenLabs later for margin + voice cloning. |
| 12 | Open source | **Fully closed** | Maximum IP control. Minor philosophical tension with the OpenClaw local-first/open ethos, but defensible for a commercial bootstrapped product; community/marketplace trust must be earned via transparency + audit logs instead of source openness. |
| 13 | Memory sync default | **Cloud sync ON by default** (opt-out per project) | Better cross-device UX, stronger retention, more COGS, weaker default privacy. Opt-out preserves the privacy story for those who want it. |
| 14 | Marketplace timing | **At launch (V1)** | Community/trust flywheel earlier. Adds review-infrastructure + curation burden at launch on top of an already ambitious bootstrapped scope — flagged as a risk; mitigated by launching with a small curated set + slow rollout of third-party publishing. |
| 15 | Product name | **Propose candidates in Phase 2** | "Cascade" is a placeholder and conflicts with Windsurf's agent name; must change before launch. |

### Final reconciliation state (2026-08-07): APPROVED FOR PHASE 2
All 15 open questions resolved. Plan is internally consistent. Human gave explicit "go" for
Phase 2 (detailed technical design + implementation), with the understanding that Phase 2
begins with technical design documents and the human will confirm before any production code.

### Reconciliation note (2026-08-07)
Initial answers (bootstrapped + all-four-at-launch + multi-region phone + larger team) were
internally contradictory and not survivable. Human chose to **trim geography to US/CA and team
to 2–3**, keeping bootstrapped + all four surfaces + dual client. Plan is now internally
consistent.

### Honest implications the human should weigh (not vetoes — your call stands)
- **"All four at launch" + "both desktop+web" is the maximally ambitious combination.** Realistically
  this is a 6–9+ month build for a small team before a *paid* launch, with meaningful infra/compliance
  cost incurred before any revenue. If bootstrapped, this is risky. If funded, it's defensible.
- **BYO-key-first pricing** meaningfully de-risks the cost side, which partially offsets the ambition
  above — good pairing. But it caps ARPU and means managed inference becomes a smaller revenue line.
- The combination is internally consistent and strategically strong **if** you have the runway and
  team. Open question 13 (funding/runway) and 15 (team) now become the most important unanswered items.

## APPENDIX B — Roadmap revision required (pending remaining answers)
Because MVP = all four + dual client, the §8 roadmap's "MVP = coding+local only" is no longer valid.
A revised roadmap will be produced in Phase 2 once remaining open questions (esp. funding/team,
compliance, phone geography, IDE approach, voice stack) are answered. Indicative revised shape:
- **Pre-launch build (≈6–9 mo):** all four surfaces to a chargeable beta.
- **Paid GA:** all four on BYO-key-first pricing.
- **V1/V2:** marketplace, enterprise, HIPAA, reseller — as before.
