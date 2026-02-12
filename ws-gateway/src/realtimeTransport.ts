import OpenAI from "openai";
import { OpenAIRealtimeWS } from "openai/realtime/ws";
import { WebSocket } from "ws";

export const rawBinaryAudioEventType = "__raw_binary_audio__";

export type RealtimeEvent = {
  type: string;
  [key: string]: unknown;
};

export type RealtimeTransport = "openai_sdk" | "raw_ws";

type RawBinaryAudioEvent = {
  type: typeof rawBinaryAudioEventType;
  audio: string;
};

export type RealtimeIncomingEvent = RealtimeEvent | RawBinaryAudioEvent;

export type RealtimeConnection = {
  onOpen: (handler: () => void) => void;
  onMessage: (handler: (event: RealtimeIncomingEvent) => void) => void;
  onClose: (handler: (code: number, reason: string) => void) => void;
  onError: (handler: (err: unknown) => void) => void;
  send: (payload: object) => void;
  close: (code?: number, reason?: string) => void;
  isOpen: () => boolean;
};

const toReasonString = (reason: unknown) => {
  if (typeof reason === "string") return reason;
  if (Buffer.isBuffer(reason)) return reason.toString();
  return "";
};

const parseRealtimeEvent = (data: string): RealtimeEvent | null => {
  try {
    const parsed = JSON.parse(data);
    if (!parsed || typeof parsed !== "object") return null;
    const typed = parsed as RealtimeEvent;
    if (typeof typed.type !== "string") return null;
    return typed;
  } catch {
    return null;
  }
};

const createRawWsConnection = ({
  apiKey,
  model,
  realtimeUrl,
  includeBetaHeader,
}: {
  apiKey: string;
  model: string;
  realtimeUrl: string;
  includeBetaHeader: boolean;
}): RealtimeConnection => {
  const url = `${realtimeUrl}?model=${encodeURIComponent(model)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
  };
  if (includeBetaHeader) {
    headers["OpenAI-Beta"] = "realtime=v1";
  }
  const socket = new WebSocket(url, { headers });

  return {
    onOpen: (handler) => {
      socket.on("open", handler);
    },
    onMessage: (handler) => {
      socket.on("message", (data, isBinary) => {
        if (isBinary) {
          const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
          handler({ type: rawBinaryAudioEventType, audio: buffer.toString("base64") });
          return;
        }
        const payload = parseRealtimeEvent(data.toString());
        if (payload) handler(payload);
      });
    },
    onClose: (handler) => {
      socket.on("close", (code, reason) => handler(code, toReasonString(reason)));
    },
    onError: (handler) => {
      socket.on("error", handler);
    },
    send: (payload) => {
      socket.send(JSON.stringify(payload));
    },
    close: (code, reason) => {
      socket.close(code, reason);
    },
    isOpen: () => socket.readyState === WebSocket.OPEN,
  };
};

const createSdkConnection = ({
  apiKey,
  model,
  realtimeApiBaseUrl,
  includeBetaHeader,
}: {
  apiKey: string;
  model: string;
  realtimeApiBaseUrl: string;
  includeBetaHeader: boolean;
}): RealtimeConnection => {
  const client = new OpenAI({
    apiKey,
    baseURL: realtimeApiBaseUrl,
  });
  const socket = new OpenAIRealtimeWS(
    {
      model,
      options: includeBetaHeader
        ? {
            headers: {
              "OpenAI-Beta": "realtime=v1",
            },
          }
        : undefined,
    },
    client
  );

  return {
    onOpen: (handler) => {
      socket.socket.on("open", handler);
    },
    onMessage: (handler) => {
      socket.on("event", (event) => {
        handler(event as unknown as RealtimeEvent);
      });
    },
    onClose: (handler) => {
      socket.socket.on("close", (code, reason) => handler(code, toReasonString(reason)));
    },
    onError: (handler) => {
      socket.on("error", (err) => handler(err));
      socket.socket.on("error", handler);
    },
    send: (payload) => {
      socket.send(payload as never);
    },
    close: (code, reason) => {
      socket.close(
        code == null && reason == null
          ? undefined
          : {
              code: code ?? 1000,
              reason: reason ?? "OK",
            }
      );
    },
    isOpen: () => socket.socket.readyState === WebSocket.OPEN,
  };
};

export const createRealtimeConnection = ({
  transport,
  apiKey,
  model,
  realtimeUrl,
  realtimeApiBaseUrl,
  includeBetaHeader,
}: {
  transport: string;
  apiKey: string;
  model: string;
  realtimeUrl: string;
  realtimeApiBaseUrl: string;
  includeBetaHeader: boolean;
}): RealtimeConnection => {
  const normalizedTransport: RealtimeTransport = transport === "raw_ws" ? "raw_ws" : "openai_sdk";
  return normalizedTransport === "raw_ws"
    ? createRawWsConnection({ apiKey, model, realtimeUrl, includeBetaHeader })
    : createSdkConnection({ apiKey, model, realtimeApiBaseUrl, includeBetaHeader });
};
