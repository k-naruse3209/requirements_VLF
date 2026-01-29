import http from "node:http";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";

type TwilioEvent =
  | { event: "connected" }
  | { event: "start"; start: { streamSid: string; callSid: string } }
  | { event: "media"; media: { payload: string; track: "inbound" | "outbound" } }
  | { event: "stop" }
  | { event: "mark"; mark: { name: string } };

type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

const server = http.createServer();
const wss = new WebSocketServer({ server });

const safeJson = (data: string): unknown => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const logPrefix = (wsId: string) => `[ws:${wsId}]`;

const createRealtimeSocket = () => {
  if (!config.openaiApiKey) return null;
  const url = `${config.realtimeUrl}?model=${encodeURIComponent(config.realtimeModel)}`;
  return new WebSocket(url, {
    headers: {
      Authorization: `Bearer ${config.openaiApiKey}`,
      "OpenAI-Beta": "realtime=v1",
    },
  });
};

wss.on("connection", (ws: WebSocket) => {
  const wsId = Math.random().toString(36).slice(2, 8);
  let streamSid = "";
  let mediaCount = 0;
  let realtime: WebSocket | null = null;
  let realtimeReady = false;
  let silenceTimer: NodeJS.Timeout | null = null;
  let hasBufferedAudio = false;

  console.log(`${logPrefix(wsId)} connected`);

  const sendToRealtime = (payload: object) => {
    if (!realtime || realtime.readyState !== WebSocket.OPEN) return;
    realtime.send(JSON.stringify(payload));
  };

  const scheduleCommit = () => {
    if (!realtimeReady) return;
    if (silenceTimer) clearTimeout(silenceTimer);
    silenceTimer = setTimeout(() => {
      if (!hasBufferedAudio) return;
      hasBufferedAudio = false;
      sendToRealtime({ type: "input_audio_buffer.commit" });
      sendToRealtime({ type: "response.create" });
    }, 650);
  };

  const sendToTwilio = (audioBase64: string) => {
    if (!streamSid) return;
    ws.send(
      JSON.stringify({
        event: "media",
        streamSid,
        media: { payload: audioBase64, track: "outbound" },
      })
    );
  };

  if (!config.openaiApiKey) {
    console.error(`${logPrefix(wsId)} missing OPENAI_API_KEY`);
    ws.close();
    return;
  }

  realtime = createRealtimeSocket();
  if (realtime) {
    realtime.on("open", () => {
      realtimeReady = true;
      sendToRealtime({
        type: "session.update",
        session: {
          input_audio_format: "g711_ulaw",
          output_audio_format: "g711_ulaw",
          modalities: ["audio", "text"],
        },
      });
      console.log(`${logPrefix(wsId)} realtime connected`);
    });

    realtime.on("message", (data) => {
      const payload = safeJson(data.toString()) as RealtimeEvent | null;
      if (!payload) return;
      if (payload.type === "response.audio.delta") {
        const delta = payload.delta as string | undefined;
        if (delta) sendToTwilio(delta);
        return;
      }
      if (payload.type === "output_audio_buffer.audio") {
        const audio = payload.audio as string | undefined;
        if (audio) sendToTwilio(audio);
      }
    });

    realtime.on("close", () => {
      realtimeReady = false;
      console.log(`${logPrefix(wsId)} realtime closed`);
    });

    realtime.on("error", (err) => {
      console.error(`${logPrefix(wsId)} realtime error`, err);
    });
  }

  ws.on("message", (raw) => {
    const text = raw.toString();
    const payload = safeJson(text);
    if (!payload || typeof payload !== "object") return;

    const event = payload as TwilioEvent;
    switch (event.event) {
      case "start":
        streamSid = event.start.streamSid;
        console.log(`${logPrefix(wsId)} stream started`, event.start);
        break;
      case "media":
        mediaCount += 1;
        if (mediaCount === 1 || mediaCount % 50 === 0) {
          console.log(`${logPrefix(wsId)} media chunks`, mediaCount);
        }
        if (realtimeReady) {
          sendToRealtime({ type: "input_audio_buffer.append", audio: event.media.payload });
          hasBufferedAudio = true;
          scheduleCommit();
        }
        break;
      case "stop":
        console.log(`${logPrefix(wsId)} stream stopped`);
        if (silenceTimer) {
          clearTimeout(silenceTimer);
          silenceTimer = null;
        }
        if (realtimeReady && hasBufferedAudio) {
          hasBufferedAudio = false;
          sendToRealtime({ type: "input_audio_buffer.commit" });
          sendToRealtime({ type: "response.create" });
        }
        break;
      default:
        break;
    }
  });

  ws.on("close", () => {
    console.log(`${logPrefix(wsId)} disconnected`);
    if (realtime && realtime.readyState === WebSocket.OPEN) {
      realtime.close();
    }
  });

  ws.on("error", (err) => {
    console.error(`${logPrefix(wsId)} error`, err);
  });
});

server.listen(config.port, () => {
  console.log(`WS gateway listening on :${config.port}`);
  console.log(`Realtime URL: ${config.realtimeUrl}`);
  console.log(`Realtime model: ${config.realtimeModel}`);
});
