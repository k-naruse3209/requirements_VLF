# AGENTS.md (requirements_VLF)

## Mission
- Keep `docs/` and runtime behavior aligned, and ship a stable MVP voice flow.
- When spec and runtime diverge, document the gap and patch code + docs together in the same work cycle.

## Allowed edits
- docs/**, .specify/**, voip-client/**, proxy/**, ws-gateway/**, api/**, db/** (spec kit + VoIP client + local proxy + ws gateway + API/DB)

## Runtime prerequisites (before any voice test)
- Start services in order: `api`/`db` -> `ws-gateway` -> `proxy` -> `voip-client` -> `ngrok`.
- Verify routing is alive before testing:
  - `voip-client` receives `POST /voice`.
  - `proxy` shows `/stream` websocket forwarding.
  - `ws-gateway` logs `connected` and `stream started`.

## Required verification (before commit/push)
- For `ws-gateway` logic changes:
  - `npm run build`
  - `npm run rice-test`
- For runtime fixes, attach one call evidence set with:
  - `CallSid`
  - `state.enter` transitions
  - key Realtime events (`speech_started`, `speech_stopped`, `committed`, transcription completed, `response.created/done`)

## Required outputs
- List contradictions, missing fields, and propose exact edits with file+section anchors.
- Provide a short verification checklist (what to review in PR).
- For bug fixes, include: `cause`, `patch`, `evidence log`.

## Guardrails
- Never invent prices/stock/delivery dates; require tool outputs or mark as OpenQuestion.
- Prefer small PRs (1-2 files) and incremental changes.
- Do not commit secrets (`.env`, API keys, tokens). Always mask credentials in shared logs.
- Do not change behavior silently: log important state transitions and response trigger reasons.

## Voice flow acceptance criteria
- First turn greeting must be emitted once.
- User turn processing must be commit-driven (no unsolicited assistant progression).
- `ST_ProductSuggestion` must appear when brand + weight are both fixed.
- DB write must happen exactly once at the intended confirmation point.

## Git policy
- Use focused commits with explicit scope in commit message.
- Do not include unrelated modified files in a fix commit.
- Push only after required verification commands pass.

## Failure report template (when unresolved)
- Repro steps
- Expected vs actual
- Latest commit hash
- Exact log excerpt with `CallSid` and state/event timeline
