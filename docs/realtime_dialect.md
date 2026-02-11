# Realtime Dialect Report

## Goal
Document the exact OpenAI Realtime “dialect” that reliably returns audio deltas.

## Verified Combo (fill after smoke test)
### Combo A (audio schema, beta header off)
- Model: `gpt-realtime`
- URL: `wss://api.openai.com/v1/realtime`
- Header: `OpenAI-Beta: realtime=v1` **off**
- Session update shape: `audio`
- Session update payload:
  - `session.type: "realtime"`
  - `session.audio.input.format.type: "audio/pcm"`
  - `session.audio.input.format.rate: 24000`
  - `session.audio.output.format.type: "audio/pcm"`
  - `session.audio.output.format.rate: 24000`
  - `session.audio.output.voice: "alloy"`
  - `session.output_modalities: ["audio"]`
- Response create shape:
  - `{"type":"response.create","response":{"audio":{"output":{"format":{"type":"audio/pcm","rate":24000},"voice":"alloy"}}}}`
- Output event: `response.output_audio.delta` or `response.audio.delta` (smoke test accepts either)
- Notes:
  - `input_audio_buffer_commit_empty` appears intermittently, but audio delta still arrives.
  - `session.turn_detection` is rejected in this dialect.
  - **This combo is used for Twilio integration** (PCM24k <-> PCMU 8k conversion in ws-gateway).

### Combo B (flat schema, beta header on)
- Model: `gpt-realtime`
- URL: `wss://api.openai.com/v1/realtime`
- Header: `OpenAI-Beta: realtime=v1` **on**
- Session update shape: `flat`
- Session update payload:
  - `session.input_audio_format: "pcm16"`
  - `session.output_audio_format: "pcm16"`
  - `session.voice: "alloy"`
  - `session.modalities: ["audio","text"]`
- Response create shape:
  - `{"type":"response.create","response":{"modalities":["audio","text"],"output_audio_format":"pcm16","voice":"alloy"}}`
- Output event: `response.output_audio.delta` or `response.audio.delta` (smoke test accepts either)
- Notes:
  - `input_audio_buffer_commit_empty` appears intermittently, but audio delta still arrives.

## Smoke Test
Use the ws-gateway smoke test before Twilio integration.

```bash
cd ws-gateway
OPENAI_API_KEY=... REALTIME_MODEL=... REALTIME_BETA_HEADER=1 REALTIME_SCHEMA=flat npm run smoke
```

### Env Vars
- `REALTIME_MODEL` default: `gpt-realtime`
- `REALTIME_URL` default: `wss://api.openai.com/v1/realtime`
- `REALTIME_BETA_HEADER`: `1` to send `OpenAI-Beta: realtime=v1`, `0` to omit
- `REALTIME_SCHEMA`: `flat` or `audio`
- `REALTIME_AUDIO_RATE`: output/input sample rate for audio schema (default `24000`)
- `REALTIME_COMMIT_FRAMES`: Twilio frame count before commit in ws-gateway (default `50`)
- `REALTIME_INTERRUPT_RESPONSE`: `0` disables server-side interrupt (default `1`)
- `BARGE_IN_CANCEL`: `1` enables gateway-side barge-in cancel (default `0`)
- `REALTIME_VAD_SILENCE_MS`: server VAD silence tail in ms (default `800`)
- `RUNS`: number of consecutive success runs (default `10`)
- `AUDIO_MS`: input audio duration in ms (default `600`)
- `TIMEOUT_MS`: per-run timeout (default `8000`)

## Voice Stability Profile (flat schema)
- Runtime startup logs must include:
  - `interruptResponseConfigured`
  - `interruptResponseEnabled`
  - `bargeInCancelEnabled`
  - `vadSilenceMs`
- To avoid mid-utterance cut in the current Twilio flow, run with:
  - `BARGE_IN_CANCEL=0`
  - `REALTIME_INTERRUPT_RESPONSE=1`
  - effective behavior becomes `interruptResponseEnabled=false` (logged at startup)
- Read-aloud prompt handling:
  - Response instructions must contain only the user-audible utterance text (no meta prompt wrapper).
  - Example markers such as `（例: コシヒカリ）` / `(例: 5kg)` are stripped before read-aloud.

### Additional Stability Guardrails (2026-02-11)
- Barge-in cancel must be gated by `interruptResponseEnabled`.
  - `input_audio_buffer.speech_started` should not trigger `response.cancel` when interrupt is effectively off.
- ASR noise hardening for brand extraction:
  - Non-Japanese transcripts are ignored before state updates.
  - Fuzzy brand candidates are logged (`brand.fuzzy.ignored`) and not applied to context/state transitions.
  - Known ASR alias variants can be promoted to exact dictionary entries (e.g. `星光` -> `コシヒカリ`).
  - Exact alias matches take precedence over fuzzy candidates, even when alias text is shorter.
- Follow-up prompt on `transcript.noinfo` must focus on missing slots:
  - weight is known -> ask brand only; brand is known -> ask weight only.
  - avoid resetting to a generic "brand and weight" prompt when one slot is already captured.
- Commit/transcript turn gating:
  - Ignore `input_audio_buffer.committed` when no `input_audio_buffer.speech_started` was observed for that turn.
  - Keep a short wait window for late transcription events so a valid committed turn is not dropped by event ordering.
- Requirement-slot update scope:
  - Brand/weight extraction and context updates are allowed only in `ST_Greeting` and `ST_RequirementCheck`.
  - Non-requirement states (product suggestion, price, address, delivery, order confirmation) must not overwrite captured brand/weight slots.
- Closing reason hardening:
  - Default `closingReason` must be `error`; transition to `ST_Closing` with `success`/`cancel` only at explicit success or user-cancel points.

## Call Transcript Extraction (offline)
- ws-gateway logs now emit one-line JSON conversation events:
  - `[CONV] USER {"text":"...","confidence":...}`
  - `[CONV] AI {"text":"...","source":"response.audio_transcript.done|response.done"}`
- Extract the latest call conversation:

```bash
cd ws-gateway
LOG_DIR="$(cat /tmp/vlf_phase0_log_dir)" npm run conv:last
```

- Extract all conversation lines in the log:

```bash
cd ws-gateway
LOG_DIR="$(cat /tmp/vlf_phase0_log_dir)" npm run conv:all
```

## Known Pitfalls
- `session.audio` can be rejected by some models with `Unknown parameter`.
- Audio event names vary; accept both `response.output_audio.delta` and `response.audio.delta`.
- `response.create` must include a `response` wrapper when forcing modalities.

## Observations (smoke test runs)
- `REALTIME_BETA_HEADER=1` + `REALTIME_SCHEMA=flat`:
  - `session.created` reports `input_audio_format: pcm16`, `output_audio_format: pcm16`.
  - `modalities: ["audio"]` is rejected; must use `["audio","text"]`.
  - `input_audio_buffer_commit_empty` can appear if commit happens too early.
- `REALTIME_BETA_HEADER=0`:
  - `session.created` exposes `audio` object and `output_modalities`.
  - `session.update` requires `session.type` (e.g. `realtime`).
  - `response.modalities` is rejected in this dialect.
  - `session.turn_detection` is rejected (`Unknown parameter`) in this dialect.
  - `session.audio.*.format.rate` is required for `audio/pcm`.
  - `audio/pcm` requires `rate >= 24000`.
