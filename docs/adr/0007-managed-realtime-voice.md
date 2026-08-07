# ADR-0007 — Managed realtime voice APIs at launch

- **Status:** Accepted (2026-08-07)
- **Decider:** human (Phase 2 §12)

## Context
Real-time voice needs sub-800ms end-to-end latency with barge-in. Options: managed realtime
APIs (OpenAI Realtime, xAI) end-to-end, or self-hosted ASR (Deepgram/Whisper) + TTS
(ElevenLabs/PlayHT) + our own LLM streaming.

## Decision
Use **managed realtime APIs at launch**; migrate pieces to self-hosted post-launch as volume
justifies.

## Consequences
- (+) Lowest latency, fastest to ship, fewer moving parts at launch.
- (-) Higher per-minute COGS; less control over voice cloning.
- (-) Provider dependency for the voice surface. Mitigated by the realtime bridge abstraction
  (swap providers/self-host behind it).
- Migration triggers: per-minute volume where self-host ASR/TTS becomes cheaper, or strong
  demand for voice cloning/branded personas.
