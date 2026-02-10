# Speckit Parity Migration Plan (Stability First)

## Goal
- Reproduce the stable call behavior observed in `requirements_VLF_codex_speckit` first.
- Re-introduce `requirements_VLF_codex_realtime_verbatim` enhancements in small, reversible steps.
- Keep each PR small (1-2 files) and attach one real-call evidence set per step.

## Scope (Voice Runtime Files)
- `ws-gateway/src/index.ts`
- `ws-gateway/src/config.ts`
- `ws-gateway/src/conversation.ts`
- `ws-gateway/src/audio.ts`
- `ws-gateway/src/tools.ts` (only if needed; not primary for audio cut issues)

## Baseline Differences To Normalize
1. `session.update.turn_detection.interrupt_response`
   - speckit: fixed `true`
   - realtime_verbatim: configurable and currently used as `false` in tests
2. Assistant output triggering
   - speckit: `response.create` centered
   - realtime_verbatim: `conversation.item.create` + `response.create` + verbatim wrapper
3. Inbound media gating during assistant output
   - speckit: no explicit drop
   - realtime_verbatim: drops inbound media while assistant is speaking / mark pending
4. Twilio playback mark guard
   - speckit: none
   - realtime_verbatim: `response.done` -> send mark, block inbound until ack
5. Empty transcript handling
   - speckit: log only
   - realtime_verbatim: immediate `onUserCommitWithoutTranscript` -> `EX_NoHear`
6. Non-Japanese transcript handling
   - speckit: skip
   - realtime_verbatim: route to NoHear

## Migration Strategy
- Use feature flags in `config.ts`.
- Default values should match speckit behavior first.
- Turn on one enhancement at a time and verify with one real call.

## Phase Plan

### Phase 0: Lock Baseline (No Behavior Change)
Files:
- `ws-gateway/src/index.ts`
- `ws-gateway/src/config.ts`

Actions:
- Add explicit startup log snapshot for runtime knobs (interrupt mode, VAD silence, media drop guard, mark guard).
- Keep existing behavior unchanged.

Verification:
- `npm run build`
- `npm run verify`
- One call evidence set: `CallSid`, `state.enter`, `response.created/done`, `input_audio_buffer.committed`, transcription completed.

---

### Phase 1: Speckit Parity Defaults (Stability First)
Files:
- `ws-gateway/src/config.ts`
- `ws-gateway/src/index.ts`

Actions:
- Introduce and set defaults to parity mode:
  - `FEATURE_EXPLICIT_CONVERSATION_ITEM=0`
  - `FEATURE_VERBATIM_WRAPPER=0`
  - `FEATURE_INBOUND_DROP_WHILE_ASSISTANT=0`
  - `FEATURE_TWILIO_MARK_GUARD=0`
  - `FEATURE_EMPTY_COMMIT_TO_NOHEAR=0`
  - `FEATURE_NON_JA_TO_NOHEAR=0`
  - `REALTIME_INTERRUPT_RESPONSE=1`
  - `REALTIME_VAD_SILENCE_MS=800`
- In `index.ts`, branch behavior by these flags.

Verification:
- `npm run build`
- `npm run verify`
- One call evidence set and confirm no mid-utterance cut in greeting + first prompt.

---

### Phase 2: Re-introduce Safer Enhancements One-by-One

#### 2A. Empty Commit Recovery
Files:
- `ws-gateway/src/index.ts`
- `ws-gateway/src/conversation.ts`

Action:
- Enable `FEATURE_EMPTY_COMMIT_TO_NOHEAR=1` only.

Pass criteria:
- Empty commit transitions to `EX_NoHear`, but normal speech remains stable.

#### 2B. Non-Japanese Recovery
Files:
- `ws-gateway/src/conversation.ts`

Action:
- Enable `FEATURE_NON_JA_TO_NOHEAR=1` only.

Pass criteria:
- No dead-end on non-Japanese transcripts; expected re-prompt occurs.

#### 2C. Explicit assistant item + verbatim wrapper
Files:
- `ws-gateway/src/index.ts`

Action:
- Enable `FEATURE_EXPLICIT_CONVERSATION_ITEM=1`, then `FEATURE_VERBATIM_WRAPPER=1` separately.

Pass criteria:
- No repeated unsolicited turns.
- `assistant transcript mismatch` rate does not increase materially.

#### 2D. Inbound drop while assistant speaking
Files:
- `ws-gateway/src/index.ts`

Action:
- Enable `FEATURE_INBOUND_DROP_WHILE_ASSISTANT=1`.

Pass criteria:
- Echo-induced `speech_started` decreases.
- No "assistant audio cut" regressions.

#### 2E. Twilio mark guard
Files:
- `ws-gateway/src/index.ts`
- `ws-gateway/src/config.ts`

Action:
- Enable `FEATURE_TWILIO_MARK_GUARD=1` with timeout guard.

Pass criteria:
- Mark ack observed in logs.
- No prolonged input starvation (`mark timeout` should be near zero).

---

## Evidence Template (Per Step)
- CallSid:
- State timeline (`[STATE] ...`):
- Realtime events (must include):
  - `input_audio_buffer.committed`
  - `conversation.item.input_audio_transcription.completed`
  - `response.created`
  - `response.done`
- Empty commit events count:
- Audio cut observed by tester: yes/no

## Rollback Rule
- If a step fails call stability, revert only that step commit and keep prior stable flags.
- Never combine multiple feature toggles in one commit.

## PR Review Checklist
- Single feature toggle change per PR.
- `npm run build` and `npm run verify` attached.
- One call evidence set attached with CallSid.
- No unrelated file changes.
