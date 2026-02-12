# OpenAI SDK Migration (ws-gateway)

## Goal
- Keep Twilio media-stream wiring unchanged.
- Switch OpenAI Realtime connection from raw `ws` handling to OpenAI SDK.
- Force assistant utterances to follow the state-machine prompt verbatim.

## What Changed

### 1. Realtime transport adapter
- Added: `ws-gateway/src/realtimeTransport.ts`
- New transport modes:
  - `openai_sdk` (default): uses `openai/realtime/ws` (`OpenAIRealtimeWS`)
  - `raw_ws`: fallback path compatible with previous behavior
- `index.ts` now consumes a normalized `RealtimeConnection` interface.

### 2. Runtime config
- Updated: `ws-gateway/src/config.ts`
- Added env vars:
  - `REALTIME_TRANSPORT` (`openai_sdk` | `raw_ws`, default `openai_sdk`)
  - `REALTIME_API_BASE_URL` (default `https://api.openai.com/v1`)

### 3. Deterministic response generation
- Updated: `ws-gateway/src/index.ts`
- `response.create` now sets:
  - `conversation: "none"`
  - `input: []`
  - strict renderer instructions (verbatim readout only)
- This prevents context carry-over and reduces drift from state-machine prompts.

### 4. Dependency
- Updated: `ws-gateway/package.json`
- Added dependency:
  - `openai` (`^6.21.0`)

## Verification
- Build: `npm run build` (in `ws-gateway`)
- State-machine regression: `npm run rice-test` (in `ws-gateway`)
