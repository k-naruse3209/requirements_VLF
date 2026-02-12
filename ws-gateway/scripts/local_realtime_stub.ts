import http from "node:http";
import https from "node:https";
import fs from "node:fs";
import { WebSocketServer, type WebSocket } from "ws";

type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

const host = process.env.STUB_HOST || "127.0.0.1";
const port = Number(process.env.STUB_PORT || 19001);
const tlsEnabled = process.env.STUB_TLS === "1";
const tlsCertPath = process.env.STUB_CERT_PATH || "";
const tlsKeyPath = process.env.STUB_KEY_PATH || "";
const audioBytes = Number(process.env.STUB_AUDIO_BYTES || 240);
const sendUserTurn = process.env.STUB_SEND_USER_TURN === "1";
const userTranscript = process.env.STUB_USER_TRANSCRIPT || "コシヒカリ 5kg";

const log = (message: string, data?: unknown) => {
  if (data == null) {
    console.log(`[realtime-stub] ${message}`);
    return;
  }
  console.log(`[realtime-stub] ${message}`, data);
};

const parseEvent = (raw: string): RealtimeEvent | null => {
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return null;
    const typed = parsed as RealtimeEvent;
    if (typeof typed.type !== "string") return null;
    return typed;
  } catch {
    return null;
  }
};

const extractSpokenText = (instructions: unknown) => {
  if (typeof instructions !== "string") return "";
  const marker = "文章:";
  const index = instructions.lastIndexOf(marker);
  if (index === -1) return instructions.trim();
  return instructions.slice(index + marker.length).trim();
};

const send = (ws: WebSocket, payload: object) => {
  ws.send(JSON.stringify(payload));
};

const silenceAudio = Buffer.alloc(Math.max(80, audioBytes), 0xff).toString("base64");

const requestHandler: http.RequestListener = (req, res) => {
  if (req.url === "/healthz") {
    res.writeHead(200, { "content-type": "application/json" });
    res.end(JSON.stringify({ ok: true, tlsEnabled }));
    return;
  }
  res.writeHead(404).end();
};

const server = tlsEnabled
  ? (() => {
      if (!tlsCertPath || !tlsKeyPath) {
        throw new Error("STUB_TLS=1 requires STUB_CERT_PATH and STUB_KEY_PATH");
      }
      return https.createServer(
        {
          cert: fs.readFileSync(tlsCertPath),
          key: fs.readFileSync(tlsKeyPath),
        },
        requestHandler
      );
    })()
  : http.createServer(requestHandler);

const wss = new WebSocketServer({ noServer: true });

wss.on("connection", (ws, req) => {
  let responseCount = 0;
  let sentUserTurn = false;

  const url = new URL(req.url || "/", `http://${host}:${port}`);
  log("connected", { path: url.pathname, query: Object.fromEntries(url.searchParams.entries()) });

  send(ws, {
    type: "session.created",
    session: {
      id: "sess_stub_1",
    },
  });

  ws.on("message", (raw) => {
    const payload = parseEvent(raw.toString());
    if (!payload) return;
    log("recv", payload.type);

    if (payload.type === "session.update") {
      send(ws, {
        type: "session.updated",
        session: (payload as { session?: unknown }).session || {},
      });
      return;
    }

    if (payload.type === "response.create") {
      responseCount += 1;
      const responseId = `resp_stub_${responseCount}`;
      const response = payload as { response?: { instructions?: string } };
      const spoken = extractSpokenText(response.response?.instructions);
      log("response.create.meta", {
        conversation: (response.response as { conversation?: unknown } | undefined)?.conversation,
        hasInputArray: Array.isArray((response.response as { input?: unknown } | undefined)?.input),
        spokenPreview: spoken.slice(0, 80),
      });

      send(ws, {
        type: "response.created",
        response: { id: responseId },
      });
      send(ws, {
        type: "response.output_item.added",
        response_id: responseId,
        item: { id: `item_stub_${responseCount}` },
      });
      send(ws, {
        type: "response.audio_transcript.delta",
        response_id: responseId,
        delta: spoken,
      });
      send(ws, {
        type: "response.audio_transcript.done",
        response_id: responseId,
        transcript: spoken,
      });
      send(ws, {
        type: "response.output_audio.delta",
        response_id: responseId,
        delta: silenceAudio,
      });
      send(ws, {
        type: "response.done",
        response: { id: responseId },
      });
      return;
    }

    if (payload.type === "conversation.item.retrieve") {
      send(ws, {
        type: "conversation.item.retrieved",
        item: {
          id: (payload as { item_id?: string }).item_id || "unknown",
          role: "assistant",
          status: "completed",
          content: [],
        },
      });
      return;
    }

    if (payload.type === "input_audio_buffer.append" && sendUserTurn && !sentUserTurn) {
      sentUserTurn = true;
      setTimeout(() => {
        send(ws, { type: "input_audio_buffer.speech_started" });
        send(ws, { type: "input_audio_buffer.speech_stopped" });
        send(ws, {
          type: "conversation.item.input_audio_transcription.completed",
          transcript: userTranscript,
        });
        send(ws, { type: "input_audio_buffer.committed" });
      }, 50);
      return;
    }
  });

  ws.on("close", (code, reason) => {
    log("closed", { code, reason: reason.toString() });
  });
});

server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url || "/", `http://${host}:${port}`);
  if (!url.pathname.endsWith("/realtime")) {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => {
    wss.emit("connection", ws, req);
  });
});

server.listen(port, host, () => {
  log("listening", { host, port, tlsEnabled });
});
