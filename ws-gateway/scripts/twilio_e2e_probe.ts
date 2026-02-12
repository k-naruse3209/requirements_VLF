import WebSocket from "ws";

type TwilioOutboundEvent =
  | { event: "media"; media?: { payload?: string; track?: string } }
  | { event: "mark"; mark?: { name?: string } }
  | { event: string; [key: string]: unknown };

const gatewayWsUrl = process.env.GATEWAY_WS_URL || "ws://127.0.0.1:18080";
const timeoutMs = Number(process.env.PROBE_TIMEOUT_MS || 8000);
const sendMedia = process.env.PROBE_SEND_MEDIA !== "0";
const mediaFrameCount = Number(process.env.PROBE_MEDIA_FRAMES || 3);

const log = (message: string, data?: unknown) => {
  if (data == null) {
    console.log(`[twilio-probe] ${message}`);
    return;
  }
  console.log(`[twilio-probe] ${message}`, data);
};

const silenceFrame = Buffer.alloc(160, 0xff).toString("base64");

const socket = new WebSocket(gatewayWsUrl);
let completed = false;
let timeout: NodeJS.Timeout | null = null;
let receivedOutboundAudio = 0;

const finish = (ok: boolean, reason: string) => {
  if (completed) return;
  completed = true;
  if (timeout) clearTimeout(timeout);
  try {
    socket.close();
  } catch {
    // ignore
  }
  if (ok) {
    log("success", { receivedOutboundAudio, reason });
    process.exit(0);
  }
  log("failed", { receivedOutboundAudio, reason });
  process.exit(1);
};

socket.on("open", () => {
  log("connected", { gatewayWsUrl });
  socket.send(
    JSON.stringify({
      event: "start",
      start: {
        streamSid: "MZ_TEST_STREAM",
        callSid: "CA_TEST_CALL",
        customParameters: {
          customer_phone: "+819012345678",
          address: "東京都港区1-2-3",
        },
      },
    })
  );

  if (sendMedia) {
    for (let i = 0; i < mediaFrameCount; i += 1) {
      socket.send(
        JSON.stringify({
          event: "media",
          media: {
            payload: silenceFrame,
            track: "inbound",
          },
        })
      );
    }
  }
});

socket.on("message", (raw) => {
  let payload: TwilioOutboundEvent | null = null;
  try {
    payload = JSON.parse(raw.toString());
  } catch {
    return;
  }
  if (!payload) return;
  if (payload.event === "media" && payload.media?.track === "outbound" && payload.media.payload) {
    receivedOutboundAudio += 1;
    log("received outbound audio", { chunk: receivedOutboundAudio });
    socket.send(JSON.stringify({ event: "stop" }));
    finish(true, "assistant audio arrived");
  }
});

socket.on("close", (code, reason) => {
  if (!completed) {
    finish(false, `socket closed before success (${code}:${reason.toString()})`);
  }
});

socket.on("error", (err) => {
  if (!completed) {
    finish(false, `socket error: ${String(err)}`);
  }
});

timeout = setTimeout(() => {
  finish(false, `timeout ${timeoutMs}ms`);
}, timeoutMs);
