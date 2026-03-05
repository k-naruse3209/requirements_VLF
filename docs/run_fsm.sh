#!/usr/bin/env bash
set -euo pipefail

# run_fsm.sh
# Helper script to run origin/codex/fsm-core-integration locally.
# Commands:
#   up     : install deps (optional), init DB, start services
#   down   : stop services started by this script
#   status : show process status and key endpoints
#   logs   : show recent logs (all services or one service)
#   help   : show usage

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd -- "${SCRIPT_DIR}/.." && pwd)"
STATE_DIR="${ROOT_DIR}/tmp/run_fsm"
LOG_DIR="${STATE_DIR}/logs"
PID_DIR="${STATE_DIR}/pids"

SERVICES=(api tools-stub ws-gateway proxy voip-client ngrok)
OS_UNAME="$(uname -s || true)"
PLATFORM="unknown"

API_PORT="${API_PORT:-3100}"
DB_PATH="${DB_PATH:-${ROOT_DIR}/data/app.db}"
JWT_SECRET="${JWT_SECRET:-dev-secret}"
ADMIN_EMAIL="${ADMIN_EMAIL:-admin@example.com}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-pass}"
ADMIN_NAME="${ADMIN_NAME:-Admin}"

WS_PORT="${WS_PORT:-8080}"
OPENAI_API_KEY="${OPENAI_API_KEY:-}"
REALTIME_MODEL="${REALTIME_MODEL:-gpt-4o-realtime-preview}"
REALTIME_SCHEMA="${REALTIME_SCHEMA:-flat}"
REALTIME_AUDIO_MODE="${REALTIME_AUDIO_MODE:-pcmu}"
REALTIME_BETA_HEADER="${REALTIME_BETA_HEADER:-1}"
REALTIME_TRANSCRIPTION_MODEL="${REALTIME_TRANSCRIPTION_MODEL:-}"
LOG_API_BASE_URL="${LOG_API_BASE_URL:-http://127.0.0.1:${API_PORT}}"

PROXY_PORT="${PROXY_PORT:-4000}"
VOIP_PORT="${VOIP_PORT:-3001}"
VOIP_TARGET="${VOIP_TARGET:-http://127.0.0.1:${VOIP_PORT}}"
WS_TARGET="${WS_TARGET:-ws://127.0.0.1:${WS_PORT}}"

RUN_NGROK="${RUN_NGROK:-0}"
NGROK_BIN="${NGROK_BIN:-ngrok}"
NGROK_URL="${NGROK_URL:-http://127.0.0.1:${PROXY_PORT}}"
NGROK_API_URL="${NGROK_API_URL:-http://127.0.0.1:4040/api/tunnels}"
WAIT_NGROK_SECONDS="${WAIT_NGROK_SECONDS:-25}"
AUTO_NGROK_STREAM="${AUTO_NGROK_STREAM:-1}"
AUTO_WRITE_VOIP_ENV="${AUTO_WRITE_VOIP_ENV:-1}"
AUTO_CREATE_VOIP_ENV="${AUTO_CREATE_VOIP_ENV:-1}"

TOOL_BASE_URL="${TOOL_BASE_URL:-}"
AUTO_TOOL_STUB="${AUTO_TOOL_STUB:-1}"
TOOL_STUB_PORT="${TOOL_STUB_PORT:-9091}"
TOOL_STUB_SCRIPT="${TOOL_STUB_SCRIPT:-${STATE_DIR}/tools_stub.mjs}"

PRODUCT_CATALOG_PATH="${PRODUCT_CATALOG_PATH:-}"
AUTO_GENERATE_CATALOG="${AUTO_GENERATE_CATALOG:-1}"
GENERATED_CATALOG_PATH="${GENERATED_CATALOG_PATH:-${STATE_DIR}/catalog.fsm.json}"

SKIP_PLATFORM_CHECK="${SKIP_PLATFORM_CHECK:-0}"
SKIP_VOIP="${SKIP_VOIP:-0}"
INSTALL_DEPS="${INSTALL_DEPS:-1}"
TAIL_LINES="${TAIL_LINES:-80}"
FOLLOW="${FOLLOW:-0}"
AUTO_OPEN_BROWSER="${AUTO_OPEN_BROWSER:-1}"
VOIP_ENV_FILE="${VOIP_ENV_FILE:-${ROOT_DIR}/voip-client/.env}"

TOOL_BASE_URL_RUNTIME=""
PRODUCT_CATALOG_PATH_RUNTIME=""
NGROK_PUBLIC_URL=""
VOIP_STREAM_URL_RUNTIME=""
VOIP_STREAM_STATUS_URL_RUNTIME=""

log() {
  printf '[run_fsm] %s\n' "$*"
}

die() {
  printf '[run_fsm][ERROR] %s\n' "$*" >&2
  exit 1
}

detect_platform() {
  case "$OS_UNAME" in
    Darwin) PLATFORM="macos" ;;
    Linux) PLATFORM="linux" ;;
    *) PLATFORM="unknown" ;;
  esac
}

usage() {
  cat <<'EOF_USAGE'
Usage:
  ./docs/run_fsm.sh up
  ./docs/run_fsm.sh down
  ./docs/run_fsm.sh status
  ./docs/run_fsm.sh logs [api|tools-stub|ws-gateway|proxy|voip-client|ngrok]
  ./docs/run_fsm.sh help

Required environment variables for "up":
  OPENAI_API_KEY
  REALTIME_TRANSCRIPTION_MODEL

Optional environment variables:
  API_PORT                  (default: 3100)
  DB_PATH                   (default: <repo>/data/app.db)
  JWT_SECRET                (default: dev-secret)
  ADMIN_EMAIL               (default: admin@example.com)
  ADMIN_PASSWORD            (default: pass)
  ADMIN_NAME                (default: Admin)
  WS_PORT                   (default: 8080)
  REALTIME_MODEL            (default: gpt-4o-realtime-preview)
  REALTIME_SCHEMA           (default: flat)
  REALTIME_AUDIO_MODE       (default: pcmu)
  REALTIME_BETA_HEADER      (default: 1)
  LOG_API_BASE_URL          (default: http://127.0.0.1:<API_PORT>)
  PROXY_PORT                (default: 4000)
  VOIP_PORT                 (default: 3001)
  VOIP_TARGET               (default: http://127.0.0.1:<VOIP_PORT>)
  WS_TARGET                 (default: ws://127.0.0.1:<WS_PORT>)
  SKIP_VOIP                 (default: 0)
  INSTALL_DEPS              (default: 1)
  RUN_NGROK                 (default: 0)
  NGROK_BIN                 (default: ngrok)
  NGROK_URL                 (default: http://127.0.0.1:<PROXY_PORT>)
  NGROK_API_URL             (default: http://127.0.0.1:4040/api/tunnels)
  WAIT_NGROK_SECONDS        (default: 25)
  AUTO_NGROK_STREAM         (default: 1)
  AUTO_WRITE_VOIP_ENV       (default: 1)
  AUTO_CREATE_VOIP_ENV      (default: 1)
  TOOL_BASE_URL             (default: empty)
  AUTO_TOOL_STUB            (default: 1)
  TOOL_STUB_PORT            (default: 9091)
  PRODUCT_CATALOG_PATH      (default: empty)
  AUTO_GENERATE_CATALOG     (default: 1)
  GENERATED_CATALOG_PATH    (default: <repo>/tmp/run_fsm/catalog.fsm.json)
  VOIP_ENV_FILE             (default: <repo>/voip-client/.env)
  SKIP_PLATFORM_CHECK       (default: 0)
  TAIL_LINES                (default: 80)
  FOLLOW                    (default: 0)
  AUTO_OPEN_BROWSER         (default: 1)

Examples:
  OPENAI_API_KEY=... REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe RUN_NGROK=1 ./docs/run_fsm.sh up
  OPENAI_API_KEY=... REALTIME_TRANSCRIPTION_MODEL=gpt-4o-mini-transcribe TOOL_BASE_URL=http://127.0.0.1:18080 ./docs/run_fsm.sh up
  ./docs/run_fsm.sh logs ws-gateway
  ./docs/run_fsm.sh down
EOF_USAGE
}

require_cmd() {
  local cmd="$1"
  command -v "$cmd" >/dev/null 2>&1 || die "Command not found: ${cmd}"
}

check_platform_prereqs() {
  [[ "$SKIP_PLATFORM_CHECK" == "1" ]] && return 0

  require_cmd node
  require_cmd npm
  require_cmd bash
  require_cmd make
  require_cmd python3
  require_cmd curl

  if [[ "$PLATFORM" == "macos" ]]; then
    require_cmd xcode-select
    if ! xcode-select -p >/dev/null 2>&1; then
      die "Xcode Command Line Tools are missing. Run: xcode-select --install"
    fi
  fi

  if [[ "$PLATFORM" == "unknown" ]]; then
    die "Unsupported platform: ${OS_UNAME}. This script supports macOS and Linux."
  fi
}

pid_file() {
  local service="$1"
  printf '%s/%s.pid' "$PID_DIR" "$service"
}

log_file() {
  local service="$1"
  printf '%s/%s.log' "$LOG_DIR" "$service"
}

service_dir() {
  local service="$1"
  case "$service" in
    api) printf '%s/api' "$ROOT_DIR" ;;
    ws-gateway) printf '%s/ws-gateway' "$ROOT_DIR" ;;
    proxy) printf '%s/proxy' "$ROOT_DIR" ;;
    voip-client) printf '%s/voip-client' "$ROOT_DIR" ;;
    tools-stub) printf '%s' "$ROOT_DIR" ;;
    ngrok) printf '%s' "$ROOT_DIR" ;;
    *) return 1 ;;
  esac
}

is_pid_running() {
  local pid="$1"
  [[ -n "$pid" ]] && kill -0 "$pid" >/dev/null 2>&1
}

prepare_runtime_dirs() {
  mkdir -p "$LOG_DIR" "$PID_DIR" "$(dirname "$DB_PATH")" "$(dirname "$GENERATED_CATALOG_PATH")"
}

assert_fsm_layout() {
  [[ -f "${ROOT_DIR}/ws-gateway/src/stateMachine.ts" ]] || die "ws-gateway/src/stateMachine.ts not found. Use fsm-core-integration branch/worktree."
}

has_placeholder() {
  local value="$1"
  [[ -z "$value" ]] && return 0
  [[ "$value" == *"<"*">"* ]] && return 0
  [[ "$value" == *"your-ngrok"* ]] && return 0
  [[ "$value" == *"your_api_key"* ]] && return 0
  [[ "$value" == *"xxxxxxxx"* ]] && return 0
  return 1
}

get_env_file_value() {
  local env_file="$1"
  local key="$2"
  local line
  line="$(grep -E "^${key}=" "$env_file" | tail -n 1 || true)"
  line="${line#*=}"
  line="${line%\"}"
  line="${line#\"}"
  line="${line%\'}"
  line="${line#\'}"
  printf '%s' "$line"
}

upsert_env_key() {
  local env_file="$1"
  local key="$2"
  local value="$3"
  local tmp_file="${env_file}.tmp.$$"

  awk -v k="$key" -v v="$value" '
    BEGIN { done=0 }
    $0 ~ "^" k "=" {
      if (!done) {
        print k "=" v
        done=1
      }
      next
    }
    { print }
    END {
      if (!done) print k "=" v
    }
  ' "$env_file" > "$tmp_file"

  mv "$tmp_file" "$env_file"
}

ensure_voip_env_file() {
  local env_example="${ROOT_DIR}/voip-client/.env.example"

  if [[ -f "$VOIP_ENV_FILE" ]]; then
    return 0
  fi

  if [[ "$AUTO_CREATE_VOIP_ENV" == "1" && -f "$env_example" ]]; then
    cp "$env_example" "$VOIP_ENV_FILE"
    log "Created ${VOIP_ENV_FILE} from .env.example"
    return 0
  fi

  die "${VOIP_ENV_FILE} not found. Create it from .env.example"
}

check_voip_env() {
  local allow_placeholder_stream="${1:-0}"
  local required_keys=(ACCOUNT_SID API_KEY_SID API_KEY_SECRET APP_SID)
  local key value stream_url

  ensure_voip_env_file

  for key in "${required_keys[@]}"; do
    value="$(get_env_file_value "$VOIP_ENV_FILE" "$key")"
    [[ -n "$value" ]] || die "${VOIP_ENV_FILE} missing ${key}"
    if has_placeholder "$value"; then
      die "${VOIP_ENV_FILE} ${key} looks like a placeholder: ${value}"
    fi
  done

  stream_url="$(get_env_file_value "$VOIP_ENV_FILE" "STREAM_URL")"
  [[ -n "$stream_url" ]] || die "${VOIP_ENV_FILE} missing STREAM_URL"
  if has_placeholder "$stream_url" && [[ "$allow_placeholder_stream" != "1" ]]; then
    die "${VOIP_ENV_FILE} STREAM_URL looks like a placeholder: ${stream_url}"
  fi
}

extract_ngrok_url_from_json() {
  python3 -c '
import json
import sys

try:
    data = json.load(sys.stdin)
except Exception:
    print("", end="")
    raise SystemExit(0)

tunnels = data.get("tunnels", [])
public_url = ""
for tunnel in tunnels:
    url = tunnel.get("public_url", "")
    if isinstance(url, str) and url.startswith("https://"):
        public_url = url
        break

if not public_url and tunnels:
    url = tunnels[0].get("public_url", "")
    if isinstance(url, str):
        public_url = url

print(public_url, end="")
'
}

wait_for_ngrok_public_url() {
  local waited=0
  local response public_url

  while (( waited < WAIT_NGROK_SECONDS )); do
    response="$(curl -fsS "$NGROK_API_URL" 2>/dev/null || true)"
    if [[ -n "$response" ]]; then
      public_url="$(printf '%s' "$response" | extract_ngrok_url_from_json || true)"
      if [[ -n "$public_url" ]]; then
        printf '%s' "$public_url"
        return 0
      fi
    fi
    sleep 1
    waited=$((waited + 1))
  done

  return 1
}

to_ws_url() {
  local url="$1"
  if [[ "$url" == https://* ]]; then
    printf 'wss://%s' "${url#https://}"
    return 0
  fi
  if [[ "$url" == http://* ]]; then
    printf 'ws://%s' "${url#http://}"
    return 0
  fi
  printf '%s' "$url"
}

prepare_ngrok_stream_urls() {
  [[ "$RUN_NGROK" == "1" ]] || return 0
  [[ "$AUTO_NGROK_STREAM" == "1" ]] || return 0

  NGROK_PUBLIC_URL="$(wait_for_ngrok_public_url)" || die "Could not get ngrok public URL from ${NGROK_API_URL}. Is ngrok running?"
  VOIP_STREAM_URL_RUNTIME="$(to_ws_url "${NGROK_PUBLIC_URL}")/stream"
  VOIP_STREAM_STATUS_URL_RUNTIME="${NGROK_PUBLIC_URL}/twilio/stream-status"

  log "Detected ngrok public URL: ${NGROK_PUBLIC_URL}"
  log "Runtime STREAM_URL: ${VOIP_STREAM_URL_RUNTIME}"

  if [[ "$AUTO_WRITE_VOIP_ENV" == "1" ]]; then
    upsert_env_key "$VOIP_ENV_FILE" "STREAM_URL" "$VOIP_STREAM_URL_RUNTIME"
    upsert_env_key "$VOIP_ENV_FILE" "STREAM_STATUS_URL" "$VOIP_STREAM_STATUS_URL_RUNTIME"
    log "Updated ${VOIP_ENV_FILE} STREAM_URL/STREAM_STATUS_URL"
  fi
}

generate_default_catalog() {
  [[ -n "$PRODUCT_CATALOG_PATH" ]] && return 0
  [[ "$AUTO_GENERATE_CATALOG" == "1" ]] || return 0

  cat > "$GENERATED_CATALOG_PATH" <<'EOF_CATALOG'
[
  {
    "id": "rice-koshihikari-5kg",
    "name": "コシヒカリ 5kg",
    "category": "コシヒカリ",
    "description": "新潟産",
    "specs": "精米",
    "price": 3200
  },
  {
    "id": "rice-akitakomachi-5kg",
    "name": "あきたこまち 5kg",
    "category": "あきたこまち",
    "description": "秋田産",
    "specs": "精米",
    "price": 3000
  },
  {
    "id": "rice-yumepirika-5kg",
    "name": "ゆめぴりか 5kg",
    "category": "ゆめぴりか",
    "description": "北海道産",
    "specs": "精米",
    "price": 3400
  }
]
EOF_CATALOG

  PRODUCT_CATALOG_PATH_RUNTIME="$GENERATED_CATALOG_PATH"
  log "Generated catalog: ${PRODUCT_CATALOG_PATH_RUNTIME}"
}

resolve_catalog_path() {
  if [[ -n "$PRODUCT_CATALOG_PATH" ]]; then
    [[ -f "$PRODUCT_CATALOG_PATH" ]] || die "PRODUCT_CATALOG_PATH not found: ${PRODUCT_CATALOG_PATH}"
    PRODUCT_CATALOG_PATH_RUNTIME="$PRODUCT_CATALOG_PATH"
    return 0
  fi

  if [[ "$AUTO_GENERATE_CATALOG" == "1" ]]; then
    generate_default_catalog
    return 0
  fi

  die "PRODUCT_CATALOG_PATH is required when AUTO_GENERATE_CATALOG=0"
}

write_tools_stub_script() {
  cat > "$TOOL_STUB_SCRIPT" <<'EOF_TOOL_STUB'
import http from "node:http";
import fs from "node:fs";

const port = Number(process.env.TOOL_STUB_PORT || 9091);
const catalogPath = process.env.PRODUCT_CATALOG_PATH || "";

const loadCatalog = () => {
  if (!catalogPath || !fs.existsSync(catalogPath)) return [];
  try {
    const raw = fs.readFileSync(catalogPath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
};

const catalog = loadCatalog();
const priceMap = new Map();
for (const item of catalog) {
  if (!item || typeof item !== "object") continue;
  const productId = item.id;
  const price = Number(item.price);
  if (typeof productId === "string" && Number.isFinite(price)) {
    priceMap.set(productId, price);
  }
}

const readJsonBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(Buffer.from(chunk));
  const text = Buffer.concat(chunks).toString("utf8") || "{}";
  try {
    return JSON.parse(text);
  } catch {
    return {};
  }
};

const sendJson = (res, status, payload) => {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(payload));
};

const addDaysIso = (days) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const server = http.createServer(async (req, res) => {
  if (!req.url || req.method !== "POST") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const body = await readJsonBody(req);
  const productId = typeof body.productId === "string" ? body.productId : "";

  if (req.url === "/tools/stock") {
    sendJson(res, 200, { available: true, quantity: 99 });
    return;
  }

  if (req.url === "/tools/price") {
    const price = priceMap.get(productId) || 3200;
    sendJson(res, 200, { price, currency: "JPY" });
    return;
  }

  if (req.url === "/tools/delivery-date") {
    sendJson(res, 200, { deliveryDate: addDaysIso(3), estimatedDays: 3 });
    return;
  }

  if (req.url === "/tools/orders") {
    sendJson(res, 200, { orderId: `LOCAL-${Date.now()}`, status: "accepted" });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, "127.0.0.1", () => {
  console.log(`[tools-stub] listening on 127.0.0.1:${port}`);
  console.log(`[tools-stub] catalog: ${catalogPath || "(none)"}, items=${catalog.length}`);
});
EOF_TOOL_STUB
}

resolve_tool_base_url() {
  if [[ -n "$TOOL_BASE_URL" ]]; then
    TOOL_BASE_URL_RUNTIME="$TOOL_BASE_URL"
    log "Using external TOOL_BASE_URL: ${TOOL_BASE_URL_RUNTIME}"
    return 0
  fi

  if [[ "$AUTO_TOOL_STUB" != "1" ]]; then
    die "TOOL_BASE_URL is empty and AUTO_TOOL_STUB=0"
  fi

  write_tools_stub_script
  start_service tools-stub
  TOOL_BASE_URL_RUNTIME="http://127.0.0.1:${TOOL_STUB_PORT}"
  log "Using local tools stub: ${TOOL_BASE_URL_RUNTIME}"
}

validate_required_env() {
  [[ -n "$OPENAI_API_KEY" ]] || die "OPENAI_API_KEY is required"
  [[ -n "$REALTIME_TRANSCRIPTION_MODEL" ]] || die "REALTIME_TRANSCRIPTION_MODEL is required"
  has_placeholder "$OPENAI_API_KEY" && die "OPENAI_API_KEY looks like a placeholder"
  has_placeholder "$REALTIME_TRANSCRIPTION_MODEL" && die "REALTIME_TRANSCRIPTION_MODEL looks like a placeholder"

  if [[ "$RUN_NGROK" == "1" ]]; then
    require_cmd "$NGROK_BIN"
  fi

  if [[ "$SKIP_VOIP" != "1" ]]; then
    if [[ "$RUN_NGROK" == "1" && "$AUTO_NGROK_STREAM" == "1" ]]; then
      check_voip_env 1
    else
      check_voip_env 0
    fi
  fi
}

install_deps_if_needed() {
  local dirs=(db api ws-gateway proxy voip-client)
  local dir
  if [[ "$INSTALL_DEPS" != "1" ]]; then
    log "INSTALL_DEPS=0; skipping npm ci"
    return 0
  fi
  for dir in "${dirs[@]}"; do
    log "Installing dependencies: ${dir}"
    (
      cd "${ROOT_DIR}/${dir}"
      npm ci
    )
  done
}

prepare_api() {
  log "Initializing DB and seeding admin user"
  (
    cd "${ROOT_DIR}/api"
    DB_PATH="$DB_PATH" node src/init-db.js
    DB_PATH="$DB_PATH" ADMIN_EMAIL="$ADMIN_EMAIL" ADMIN_PASSWORD="$ADMIN_PASSWORD" ADMIN_NAME="$ADMIN_NAME" node src/seed-admin.js
  )
}

start_service() {
  local service="$1"
  local workdir pf lf pid
  workdir="$(service_dir "$service")"
  pf="$(pid_file "$service")"
  lf="$(log_file "$service")"

  if [[ -f "$pf" ]]; then
    pid="$(cat "$pf" || true)"
    if is_pid_running "$pid"; then
      log "${service} already running (pid=${pid})"
      return 0
    fi
    rm -f "$pf"
  fi

  : >"$lf"
  log "Starting ${service}"
  (
    cd "$workdir"
    case "$service" in
      api)
        nohup env DB_PATH="$DB_PATH" PORT="$API_PORT" JWT_SECRET="$JWT_SECRET" node src/server.js >>"$lf" 2>&1 &
        ;;
      tools-stub)
        nohup env TOOL_STUB_PORT="$TOOL_STUB_PORT" PRODUCT_CATALOG_PATH="$PRODUCT_CATALOG_PATH_RUNTIME" node "$TOOL_STUB_SCRIPT" >>"$lf" 2>&1 &
        ;;
      ws-gateway)
        nohup env OPENAI_API_KEY="$OPENAI_API_KEY" LOG_API_BASE_URL="$LOG_API_BASE_URL" REALTIME_MODEL="$REALTIME_MODEL" REALTIME_SCHEMA="$REALTIME_SCHEMA" REALTIME_AUDIO_MODE="$REALTIME_AUDIO_MODE" REALTIME_BETA_HEADER="$REALTIME_BETA_HEADER" REALTIME_TRANSCRIPTION_MODEL="$REALTIME_TRANSCRIPTION_MODEL" WS_PORT="$WS_PORT" TOOL_BASE_URL="$TOOL_BASE_URL_RUNTIME" PRODUCT_CATALOG_PATH="$PRODUCT_CATALOG_PATH_RUNTIME" npm run dev >>"$lf" 2>&1 &
        ;;
      proxy)
        nohup env PROXY_PORT="$PROXY_PORT" VOIP_TARGET="$VOIP_TARGET" WS_TARGET="$WS_TARGET" npm run dev >>"$lf" 2>&1 &
        ;;
      voip-client)
        if [[ -n "$VOIP_STREAM_URL_RUNTIME" ]]; then
          nohup env PORT="$VOIP_PORT" STREAM_URL="$VOIP_STREAM_URL_RUNTIME" STREAM_STATUS_URL="$VOIP_STREAM_STATUS_URL_RUNTIME" npm run dev >>"$lf" 2>&1 &
        else
          nohup env PORT="$VOIP_PORT" npm run dev >>"$lf" 2>&1 &
        fi
        ;;
      ngrok)
        nohup "$NGROK_BIN" http "$NGROK_URL" >>"$lf" 2>&1 &
        ;;
      *)
        die "Unknown service: ${service}"
        ;;
    esac
    echo $! >"$pf"
  )

  sleep 1
  pid="$(cat "$pf" || true)"
  if ! is_pid_running "$pid"; then
    log "${service} failed to start. Last logs:"
    tail -n 60 "$lf" || true
    rm -f "$pf"
    return 1
  fi
  log "${service} started (pid=${pid})"
}

stop_service() {
  local service="$1"
  local pf pid try
  pf="$(pid_file "$service")"
  if [[ ! -f "$pf" ]]; then
    log "${service} is not running (no pid file)"
    return 0
  fi
  pid="$(cat "$pf" || true)"
  if ! is_pid_running "$pid"; then
    log "${service} pid file exists but process is not running"
    rm -f "$pf"
    return 0
  fi

  log "Stopping ${service} (pid=${pid})"
  kill "$pid" >/dev/null 2>&1 || true
  for try in 1 2 3 4 5; do
    if ! is_pid_running "$pid"; then
      rm -f "$pf"
      log "${service} stopped"
      return 0
    fi
    sleep 1
  done

  log "Force killing ${service} (pid=${pid})"
  kill -9 "$pid" >/dev/null 2>&1 || true
  rm -f "$pf"
}

open_local_voip_ui() {
  local url="http://localhost:${VOIP_PORT}"
  [[ "$AUTO_OPEN_BROWSER" == "1" ]] || return 0
  [[ "$SKIP_VOIP" != "1" ]] || return 0

  case "$PLATFORM" in
    macos)
      if command -v open >/dev/null 2>&1; then
        open "$url" >/dev/null 2>&1 || true
        log "Opened browser: ${url}"
      fi
      ;;
    linux)
      if command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$url" >/dev/null 2>&1 || true
        log "Opened browser: ${url}"
      fi
      ;;
    *)
      ;;
  esac
}

cmd_up() {
  detect_platform
  assert_fsm_layout
  check_platform_prereqs
  prepare_runtime_dirs
  install_deps_if_needed
  validate_required_env

  resolve_catalog_path
  prepare_api

  start_service api
  resolve_tool_base_url
  start_service ws-gateway
  start_service proxy

  if [[ "$RUN_NGROK" == "1" ]]; then
    start_service ngrok
    prepare_ngrok_stream_urls
  else
    log "RUN_NGROK=0; ngrok start skipped."
  fi

  if [[ "$SKIP_VOIP" != "1" ]]; then
    start_service voip-client
    open_local_voip_ui
  else
    log "SKIP_VOIP=1; voip-client start skipped."
  fi

  cmd_status
  cat <<EOF_NEXT

Next steps:
1) Twilio Voice URL: ${NGROK_PUBLIC_URL:-https://<ngrok-domain>}/voice
2) Open: http://localhost:${VOIP_PORT}
3) Click Init -> Call

EOF_NEXT
}

cmd_down() {
  stop_service ngrok
  stop_service voip-client
  stop_service proxy
  stop_service ws-gateway
  stop_service tools-stub
  stop_service api
}

cmd_status() {
  local service pf pid state
  echo "=== run_fsm status ==="
  echo "Platform: ${PLATFORM:-unknown} (${OS_UNAME})"
  echo "ROOT_DIR: ${ROOT_DIR}"
  echo "DB_PATH : ${DB_PATH}"
  echo "LOG_DIR : ${LOG_DIR}"
  echo "Catalog : ${PRODUCT_CATALOG_PATH_RUNTIME:-${PRODUCT_CATALOG_PATH:-<auto>}}"
  echo "Tools   : ${TOOL_BASE_URL_RUNTIME:-${TOOL_BASE_URL:-<auto-stub>}}"
  echo

  for service in "${SERVICES[@]}"; do
    pf="$(pid_file "$service")"
    if [[ -f "$pf" ]]; then
      pid="$(cat "$pf" || true)"
      if is_pid_running "$pid"; then
        state="running"
      else
        state="stale-pid"
      fi
    else
      pid="-"
      state="stopped"
    fi
    printf '%-12s %-10s pid=%s log=%s\n' "$service" "$state" "$pid" "$(log_file "$service")"
  done

  echo
  echo "Endpoints:"
  echo "- API        : http://127.0.0.1:${API_PORT}"
  echo "- Tools Stub : http://127.0.0.1:${TOOL_STUB_PORT}"
  echo "- WS Gateway : ws://127.0.0.1:${WS_PORT}"
  echo "- Proxy      : http://127.0.0.1:${PROXY_PORT}"
  echo "- VoIP UI    : http://127.0.0.1:${VOIP_PORT}"
}

cmd_logs() {
  local service="${1:-}"
  local lf

  if [[ -z "$service" ]]; then
    for service in "${SERVICES[@]}"; do
      lf="$(log_file "$service")"
      echo "----- ${service} (${lf}) -----"
      if [[ -f "$lf" ]]; then
        tail -n "$TAIL_LINES" "$lf" || true
      else
        echo "(no log file yet)"
      fi
      echo
    done
    return 0
  fi

  lf="$(log_file "$service")"
  if [[ ! -f "$lf" ]]; then
    echo "(no log file yet: ${lf})"
    return 0
  fi

  if [[ "$FOLLOW" == "1" ]]; then
    tail -n "$TAIL_LINES" -f "$lf"
  else
    tail -n "$TAIL_LINES" "$lf"
  fi
}

main() {
  local cmd="${1:-help}"
  case "$cmd" in
    up)
      cmd_up
      ;;
    down)
      cmd_down
      ;;
    status)
      detect_platform
      cmd_status
      ;;
    logs)
      shift || true
      cmd_logs "${1:-}"
      ;;
    help|-h|--help)
      usage
      ;;
    *)
      usage
      die "Unknown command: ${cmd}"
      ;;
  esac
}

main "$@"
