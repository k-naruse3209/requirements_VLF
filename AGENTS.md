# AGENTS.md (requirements_VLF)

## Mission
- Complete the MVP spec in docs/ as the single source of truth.

## Allowed edits
- docs/**, .specify/**, voip-client/**, proxy/**, ws-gateway/**, api/**, db/** (spec kit + VoIP client + local proxy + ws gateway + API/DB)

## Required outputs
- List contradictions, missing fields, and propose exact edits with file+section anchors.
- Provide a short verification checklist (what to review in PR).

## Guardrails
- Never invent prices/stock/delivery dates; require tool outputs or mark as OpenQuestion.
- Prefer small PRs (1-2 files) and incremental changes.
