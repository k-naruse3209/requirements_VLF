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
- `RUNS`: number of consecutive success runs (default `10`)
- `AUDIO_MS`: input audio duration in ms (default `600`)
- `TIMEOUT_MS`: per-run timeout (default `8000`)

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
