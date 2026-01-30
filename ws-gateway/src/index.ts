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
const twilioSampleRate = 8000;

const safeJson = (data: string): unknown => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const logPrefix = (wsId: string) => `[ws:${wsId}]`;

const muLawDecodeSample = (value: number) => {
  const muLaw = (~value) & 0xff;
  const sign = muLaw & 0x80 ? -1 : 1;
  const exponent = (muLaw >> 4) & 0x07;
  const mantissa = muLaw & 0x0f;
  const sample = ((mantissa << 3) + 0x84) << exponent;
  return sign * (sample - 0x84);
};

const muLawEncodeSample = (sample: number) => {
  const bias = 0x84;
  const max = 0x1fff;
  let pcm = sample;
  let sign = 0;
  if (pcm < 0) {
    sign = 0x80;
    pcm = -pcm;
  }
  if (pcm > max) pcm = max;
  pcm += bias;
  let exponent = 7;
  for (let expMask = 0x4000; (pcm & expMask) === 0 && exponent > 0; expMask >>= 1) {
    exponent -= 1;
  }
  const mantissa = (pcm >> (exponent + 3)) & 0x0f;
  return (~(sign | (exponent << 4) | mantissa)) & 0xff;
};

const decodePcmuToPcm16 = (input: Buffer) => {
  const output = new Int16Array(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = muLawDecodeSample(input[i]);
  }
  return output;
};

const encodePcm16ToPcmu = (input: Int16Array) => {
  const output = Buffer.alloc(input.length);
  for (let i = 0; i < input.length; i += 1) {
    output[i] = muLawEncodeSample(input[i]);
  }
  return output;
};

const upsample = (input: Int16Array, factor: number) => {
  if (factor <= 1) return input;
  const output = new Int16Array(input.length * factor);
  let idx = 0;
  for (let i = 0; i < input.length; i += 1) {
    const sample = input[i];
    for (let f = 0; f < factor; f += 1) {
      output[idx++] = sample;
    }
  }
  return output;
};

const downsample = (input: Int16Array, factor: number) => {
  if (factor <= 1) return input;
  const length = Math.floor(input.length / factor);
  const output = new Int16Array(length);
  for (let i = 0; i < length; i += 1) {
    output[i] = input[i * factor];
  }
  return output;
};

const createRealtimeSocket = () => {
  if (!config.openaiApiKey) return null;
  const url = `${config.realtimeUrl}?model=${encodeURIComponent(config.realtimeModel)}`;
  const headers: Record<string, string> = {
    Authorization: `Bearer ${config.openaiApiKey}`,
  };
  if (config.realtimeBetaHeader) {
    headers["OpenAI-Beta"] = "realtime=v1";
  }
  return new WebSocket(url, {
    headers,
  });
};

wss.on("connection", (ws: WebSocket) => {
  const wsId = Math.random().toString(36).slice(2, 8);
  let streamSid = "";
  let mediaCount = 0;
  let realtime: WebSocket | null = null;
  let realtimeReady = false;
  let hasBufferedAudio = false;
  let responseActive = false;
  let responsePending = false;
  let lastOutputItemId = "";
  let sessionCreatedLogged = false;
  let audioFrameCount = 0;
  let bufferedSamples = 0;
  let awaitingResponse = false;
  const useAudioSchema = config.realtimeSchema === "audio";
  const outputSampleRate = config.realtimeAudioRate;
  const resampleFactor = Math.max(1, Math.round(outputSampleRate / twilioSampleRate));
  const minCommitSamples = Math.ceil(outputSampleRate / 10);

  console.log(`${logPrefix(wsId)} connected`);

  const sendToRealtime = (payload: object) => {
    if (!realtime || realtime.readyState !== WebSocket.OPEN) return;
    realtime.send(JSON.stringify(payload));
  };

  const logOutgoing = (label: string, payload: object) => {
    console.log(`${logPrefix(wsId)} realtime send ${label}`, JSON.stringify(payload));
  };

  const createResponse = (instructions?: string) => {
    if (responseActive || responsePending) {
      console.log(`${logPrefix(wsId)} skip response.create (active/pending)`);
      return;
    }
    const payload = useAudioSchema
      ? {
          type: "response.create",
          response: {
            audio: {
              output: {
                format: { type: "audio/pcm", rate: outputSampleRate },
                voice: "alloy",
              },
            },
            ...(instructions ? { instructions } : {}),
          },
        }
      : {
          type: "response.create",
          response: {
            modalities: ["audio", "text"],
            output_audio_format: "pcm16",
            voice: "alloy",
            ...(instructions ? { instructions } : {}),
          },
        };
    logOutgoing("response.create", payload);
    responsePending = true;
    sendToRealtime(payload);
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
      const payload = useAudioSchema
        ? {
            type: "session.update",
            session: {
              type: "realtime",
              instructions: config.realtimeInstructions,
              audio: {
                input: { format: { type: "audio/pcm", rate: outputSampleRate } },
                output: { format: { type: "audio/pcm", rate: outputSampleRate }, voice: "alloy" },
              },
              output_modalities: ["audio"],
            },
          }
        : {
            type: "session.update",
            session: {
              instructions: config.realtimeInstructions,
              input_audio_format: "pcm16",
              output_audio_format: "pcm16",
              voice: "alloy",
              modalities: ["audio", "text"],
              turn_detection: {
                type: "server_vad",
                silence_duration_ms: 800,
                create_response: false,
              },
            },
          };
      logOutgoing("session.update", payload);
      sendToRealtime(payload);
      console.log(`${logPrefix(wsId)} realtime connected`);
    });

    realtime.on("message", (data, isBinary) => {
      if (isBinary) {
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data as ArrayBuffer);
        const audio = buffer.toString("base64");
        if (audio) {
          console.log(`${logPrefix(wsId)} realtime binary audio`, buffer.length);
          sendToTwilio(audio);
        }
        return;
      }
      const payload = safeJson(data.toString()) as RealtimeEvent | null;
      if (!payload) return;
      if (payload.type === "error") {
        console.error(`${logPrefix(wsId)} realtime error event`, payload);
        const error = (payload as { error?: { code?: string } }).error;
        if (error?.code === "conversation_already_has_active_response") {
          responsePending = false;
        }
        if (error?.code === "input_audio_buffer_commit_empty") {
          awaitingResponse = false;
        }
      }
      if (payload.type === "session.created" && !sessionCreatedLogged) {
        sessionCreatedLogged = true;
        console.log(`${logPrefix(wsId)} session.created payload`, JSON.stringify(payload, null, 2));
      }
      if (payload.type === "response.output_audio.delta" || payload.type === "response.audio.delta") {
        const delta = payload.delta as string | undefined;
        if (delta) {
          if (useAudioSchema) {
            const pcm = Buffer.from(delta, "base64");
            const pcm16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
            const downsampled = downsample(pcm16, resampleFactor);
            const mulaw = encodePcm16ToPcmu(downsampled);
            sendToTwilio(mulaw.toString("base64"));
            console.log(`${logPrefix(wsId)} realtime audio delta bytes`, pcm.byteLength);
          } else {
            sendToTwilio(delta);
            console.log(`${logPrefix(wsId)} realtime audio delta bytes`, Buffer.from(delta, "base64").length);
          }
        }
        return;
      }
      if (payload.type === "output_audio_buffer.audio") {
        const audio = payload.audio as string | undefined;
        if (audio) {
          if (useAudioSchema) {
            const pcm = Buffer.from(audio, "base64");
            const pcm16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
            const downsampled = downsample(pcm16, resampleFactor);
            const mulaw = encodePcm16ToPcmu(downsampled);
            sendToTwilio(mulaw.toString("base64"));
          } else {
            sendToTwilio(audio);
          }
        }
      }
      if (payload.type === "response.content_part.added") {
        const part = payload.part as { audio?: string | { data?: string } } | undefined;
        if (part?.audio) {
          const audio = typeof part.audio === "string" ? part.audio : part.audio?.data;
          if (audio) {
            sendToTwilio(audio);
            return;
          }
        }
        console.log(`${logPrefix(wsId)} content_part keys`, Object.keys(part || {}));
        console.log(`${logPrefix(wsId)} content_part payload`, JSON.stringify(part || {}));
      }
      if (payload.type === "response.output_item.added") {
        const itemId = (payload as { item?: { id?: string } }).item?.id;
        if (itemId) lastOutputItemId = itemId;
        console.log(`${logPrefix(wsId)} output_item payload`, JSON.stringify(payload));
      }
      if (payload.type) {
        console.log(`${logPrefix(wsId)} realtime event`, payload.type);
      }
      if (payload.type === "response.created") {
        responseActive = true;
        responsePending = false;
      }
      if (payload.type === "response.done") {
        responseActive = false;
        responsePending = false;
        if (lastOutputItemId) {
          sendToRealtime({
            type: "conversation.item.retrieve",
            item_id: lastOutputItemId,
          });
        }
      }
      if (payload.type === "input_audio_buffer.speech_stopped" && useAudioSchema) {
        if (awaitingResponse && !responseActive) {
          createResponse();
          awaitingResponse = false;
        }
      }
      if (payload.type === "input_audio_buffer.committed") {
        if (!responseActive) {
          createResponse();
        }
      }
    });

    realtime.on("close", (code, reason) => {
      realtimeReady = false;
      console.log(`${logPrefix(wsId)} realtime closed`, { code, reason: reason.toString() });
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
        if (realtimeReady && config.testPrompt) {
          createResponse(config.testPrompt);
        }
        break;
      case "media":
        mediaCount += 1;
        if (mediaCount === 1 || mediaCount % 50 === 0) {
          console.log(`${logPrefix(wsId)} media chunks`, mediaCount);
        }
        if (realtimeReady) {
          if (useAudioSchema) {
            const pcmu = Buffer.from(event.media.payload, "base64");
            const pcm16 = decodePcmuToPcm16(pcmu);
            const upsampled = upsample(pcm16, resampleFactor);
            const pcmBuffer = Buffer.from(upsampled.buffer);
            sendToRealtime({ type: "input_audio_buffer.append", audio: pcmBuffer.toString("base64") });
            audioFrameCount += 1;
            bufferedSamples += upsampled.length;
            if (
              audioFrameCount >= config.realtimeCommitFrames &&
              bufferedSamples >= minCommitSamples &&
              !awaitingResponse
            ) {
              sendToRealtime({ type: "input_audio_buffer.commit" });
              awaitingResponse = true;
              audioFrameCount = 0;
              bufferedSamples = 0;
            }
          } else {
            sendToRealtime({ type: "input_audio_buffer.append", audio: event.media.payload });
          }
          hasBufferedAudio = true;
        }
        break;
      case "stop":
        console.log(`${logPrefix(wsId)} stream stopped`);
        hasBufferedAudio = false;
        if (realtimeReady && useAudioSchema && bufferedSamples >= minCommitSamples && !awaitingResponse) {
          sendToRealtime({ type: "input_audio_buffer.commit" });
          awaitingResponse = true;
          audioFrameCount = 0;
          bufferedSamples = 0;
        }
        break;
      default:
        break;
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`${logPrefix(wsId)} disconnected`, { code, reason: reason.toString() });
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
