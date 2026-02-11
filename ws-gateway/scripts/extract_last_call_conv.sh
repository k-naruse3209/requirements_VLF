#!/usr/bin/env bash
set -euo pipefail

usage() {
  cat <<'EOF'
Usage:
  scripts/extract_last_call_conv.sh [--log /path/to/ws-gateway.log] [--ws WS_ID]
  scripts/extract_last_call_conv.sh --all [--log /path/to/ws-gateway.log]

Options:
  --log PATH  Log file path (default: $LOG, or $LOG_DIR/ws-gateway.log, or /tmp/vlf_phase0_log_dir)
  --ws ID     Extract only a specific ws session id (default: latest "stream started")
  --all       Extract all [CONV] lines in the file (no call boundary filter)
  -h, --help  Show help
EOF
}

resolve_log_path() {
  if [[ -n "${INPUT_LOG_PATH:-}" ]]; then
    printf '%s\n' "$INPUT_LOG_PATH"
    return
  fi
  if [[ -n "${LOG:-}" ]]; then
    printf '%s\n' "$LOG"
    return
  fi
  if [[ -n "${LOG_DIR:-}" ]]; then
    printf '%s\n' "${LOG_DIR%/}/ws-gateway.log"
    return
  fi
  if [[ -f /tmp/vlf_phase0_log_dir ]]; then
    local dir
    dir="$(cat /tmp/vlf_phase0_log_dir)"
    printf '%s\n' "${dir%/}/ws-gateway.log"
    return
  fi
  return 1
}

extract_role_text() {
  sed -E 's/^.*\[CONV\] (AI|USER) /\1\t/' \
    | while IFS=$'\t' read -r role payload; do
        text="$(printf '%s\n' "$payload" | jq -r '.text // empty' 2>/dev/null || true)"
        [[ -n "$text" ]] && printf '%s: %s\n' "$role" "$text"
      done
}

INPUT_LOG_PATH=""
TARGET_WS=""
EXTRACT_ALL=0

while [[ $# -gt 0 ]]; do
  case "$1" in
    --log)
      INPUT_LOG_PATH="${2:-}"
      shift 2
      ;;
    --ws)
      TARGET_WS="${2:-}"
      shift 2
      ;;
    --all)
      EXTRACT_ALL=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if ! command -v rg >/dev/null 2>&1; then
  echo "rg is required but not found." >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required but not found." >&2
  exit 1
fi

LOG_PATH="$(resolve_log_path || true)"
if [[ -z "$LOG_PATH" ]]; then
  echo "Log path not found. Pass --log, or set LOG / LOG_DIR, or create /tmp/vlf_phase0_log_dir." >&2
  exit 1
fi

if [[ ! -f "$LOG_PATH" ]]; then
  echo "Log file not found: $LOG_PATH" >&2
  exit 1
fi

if [[ "$EXTRACT_ALL" -eq 1 ]]; then
  rg '\[CONV\] (AI|USER) ' "$LOG_PATH" | extract_role_text
  exit 0
fi

if [[ -z "$TARGET_WS" ]]; then
  TARGET_WS="$(rg '\[ws:[^]]+\] stream started' "$LOG_PATH" | tail -1 | sed -E 's/.*\[ws:([^]]+)\].*/\1/')"
fi

if [[ -z "$TARGET_WS" ]]; then
  echo "No 'stream started' found in: $LOG_PATH" >&2
  exit 1
fi

awk -v ws="$TARGET_WS" '
  index($0,"[ws:"ws"] stream started"){in_call=1}
  index($0,"[ws:"ws"] stream stopped"){if(in_call){in_call=0}}
  in_call && index($0,"[ws:"ws"] [CONV] "){print}
' "$LOG_PATH" | extract_role_text
