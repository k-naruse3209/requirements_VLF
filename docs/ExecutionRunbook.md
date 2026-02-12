# Execution Runbook (SDK Mode)

## Current Status
- OpenAI SDK integration is complete in `ws-gateway`.
- Fallback (`REALTIME_TRANSPORT=raw_ws`) is also supported.
- Deterministic speech control is enabled (`response.create` with `conversation: "none"` and `input: []`).

## Step 1: Set environment
1. Create env file:
   - `cp ws-gateway/.env.example ws-gateway/.env`
2. Edit required values:
   - `OPENAI_API_KEY`
   - `REALTIME_TRANSPORT=openai_sdk`
   - `REALTIME_TRANSCRIPTION_MODEL`
   - `TOOL_BASE_URL`

## Step 2: Start local stubs (recommended first)
In `ws-gateway`:

```bash
npm run tools-stub
```

In another terminal:

```bash
npm run realtime-stub
```

## Step 3: Start ws-gateway in SDK mode
In another terminal:

```bash
cd ws-gateway
set -a; source .env; set +a
npm run dev
```

Expected startup log:
- `Realtime transport: openai_sdk`

## Step 4: Quick Twilio-side E2E probe
In another terminal:

```bash
cd ws-gateway
GATEWAY_WS_URL=ws://127.0.0.1:8080 npm run twilio-probe
```

Expected result:
- `success { receivedOutboundAudio: ... }`

## Step 5: Rollback comparison (raw_ws)
Switch env:
- `REALTIME_TRANSPORT=raw_ws`

Then restart gateway and run probe again:

```bash
GATEWAY_WS_URL=ws://127.0.0.1:8080 npm run twilio-probe
```

## Step 6: Real call test
1. Start:
   - `api`
   - `ws-gateway`
   - `voip-client`
   - `proxy`
2. Expose proxy with ngrok and configure:
   - Twilio Voice URL: `https://<ngrok>/voice`
   - `voip-client/.env` `STREAM_URL=wss://<ngrok>/stream`
3. Place a browser call from `voip-client`.

## Troubleshooting
- If SDK mode fails but `raw_ws` works:
  - Verify `REALTIME_API_BASE_URL=https://api.openai.com/v1`
  - Ensure `OPENAI_API_KEY` is valid
  - Check TLS/proxy settings in the execution environment
- If tool calls fail:
  - Confirm `TOOL_BASE_URL`
  - Run `npm run tools-stub` and retry
