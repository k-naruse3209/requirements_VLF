import http from "node:http";
import fs from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import { createConversationController, type Product } from "./conversation.js";
import { createToolClient } from "./tools.js";

type TwilioEvent =
  | { event: "connected" }
  | {
      event: "start";
      start: { streamSid: string; callSid: string; customParameters?: Record<string, string> };
    }
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

const extractContentText = (content: unknown): string | null => {
  if (!Array.isArray(content)) return null;
  for (const part of content) {
    if (!part || typeof part !== "object") continue;
    const piece = part as Record<string, unknown>;
    if (piece.type === "input_text" || piece.type === "text") {
      const text = piece.text ?? piece.value;
      if (typeof text === "string" && text.trim()) return text;
    }
    if (piece.type === "audio" && typeof piece.transcript === "string" && piece.transcript.trim()) {
      return piece.transcript;
    }
  }
  return null;
};

const extractUserTranscript = (
  payload: RealtimeEvent
): { text: string; confidence: number | null } | null => {
  if (payload.type === "input_audio_transcription.completed") {
    const text = (payload as { transcript?: string; text?: string }).transcript ||
      (payload as { text?: string }).text;
    const confidence = (payload as { confidence?: number }).confidence;
    if (typeof text === "string" && text.trim()) {
      return { text, confidence: Number.isFinite(confidence) ? confidence : null };
    }
  }
  if (payload.type === "conversation.item.input_audio_transcription.completed") {
    console.log(`${logPrefix("transcription")} input_audio_transcription.completed`, JSON.stringify(payload));
    const text = (payload as { transcript?: string; text?: string }).transcript ||
      (payload as { text?: string }).text;
    if (typeof text === "string" && text.trim()) {
      return { text, confidence: null };
    }
  }
  if (payload.type === "conversation.item.added" || payload.type === "conversation.item.created") {
    const item = (payload as { item?: { role?: string; content?: unknown } }).item;
    if (item?.role === "user") {
      const text = extractContentText(item.content);
      if (text) return { text, confidence: null };
    }
  }
  return null;
};

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

const generateBeepPcmu = (frequencyHz: number, durationMs: number) => {
  const sampleRate = 8000;
  const totalSamples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = Buffer.alloc(totalSamples);
  for (let i = 0; i < totalSamples; i += 1) {
    const t = i / sampleRate;
    const sample = Math.round(Math.sin(2 * Math.PI * frequencyHz * t) * 12000);
    buffer[i] = muLawEncodeSample(sample);
  }
  return buffer;
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

const loadCatalog = (): Product[] => {
  if (!config.productCatalogPath) return [];
  try {
    const raw = fs.readFileSync(config.productCatalogPath, "utf8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed as Product[];
    if (Array.isArray(parsed?.items)) return parsed.items as Product[];
  } catch (err) {
    console.error("[catalog] failed to load", err);
  }
  return [];
};

const productCatalog = loadCatalog();
const toolClient = createToolClient({
  baseUrl: config.toolBaseUrl,
  stockTimeoutMs: config.toolStockTimeoutMs,
  priceTimeoutMs: config.toolPriceTimeoutMs,
  deliveryTimeoutMs: config.toolDeliveryTimeoutMs,
  orderTimeoutMs: config.toolOrderTimeoutMs,
});

const createLogClient = () => {
  if (!config.logApiBaseUrl) return null;
  const timeoutMs = config.logApiTimeoutMs;
  const request = async (path: string, payload: object, method = "POST") => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(`${config.logApiBaseUrl}${path}`, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      return res.ok ? await res.json() : null;
    } catch (err) {
      console.error("[log] request failed", path, err);
      return null;
    } finally {
      clearTimeout(timeout);
    }
  };
  return {
    createCall: (payload: object) => request("/api/v1/call_logs", payload),
    updateCall: (id: string, payload: object) => request(`/api/v1/call_logs/${id}`, payload, "PUT"),
    appendMessage: (id: string, payload: object) =>
      request(`/api/v1/call_logs/${id}/messages`, payload),
    upsertInquiry: (payload: object) => request("/api/v1/rice_inquiries", payload),
  };
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
  let commitPending = false;
  let commitTimer: NodeJS.Timeout | null = null;
  let queuedPrompt: string | null = null;
  let conversationStarted = false;
  let stopReceived = false;
  let callLogId: string | null = null;
  let callLogEnded = false;
  let testToneSent = false;
  const useAudioSchema = config.realtimeSchema === "audio";
  const audioMode = config.realtimeAudioMode === "pcm16" ? "pcm16" : "pcmu";
  const outputSampleRate = audioMode === "pcmu" ? twilioSampleRate : config.realtimeAudioRate;
  const resampleFactor =
    audioMode === "pcmu" ? 1 : Math.max(1, Math.round(outputSampleRate / twilioSampleRate));
  const minCommitSamples = Math.ceil(outputSampleRate / 10);
  const vadEnabled = true;
  let pendingTranscript: { text: string; confidence: number | null; ts: number } | null = null;
  let queuedUserTranscript: { text: string; confidence: number | null } | null = null;
  let assistantTranscript = "";
  let assistantTranscriptStartedAt: string | null = null;
  let lastAssistantPrompt = "";
  let lastAssistantDoneAt = 0;
  const echoSuppressionMs = 800;

  console.log(`${logPrefix(wsId)} connected`);
  console.log(`${logPrefix(wsId)} audio.pipeline`, {
    twilioInput: `audio/pcmu@${twilioSampleRate}`,
    realtimeInput:
      useAudioSchema
        ? `${audioMode === "pcmu" ? "audio/pcmu" : "audio/pcm"}@${outputSampleRate}`
        : audioMode === "pcmu"
        ? "g711_ulaw"
        : "pcm16",
    realtimeOutput:
      useAudioSchema
        ? `${audioMode === "pcmu" ? "audio/pcmu" : "audio/pcm"}@${outputSampleRate}`
        : audioMode === "pcmu"
        ? "g711_ulaw"
        : "pcm16",
    conversion: audioMode === "pcmu" ? "passthrough" : `pcmu->pcm16@${outputSampleRate}`,
  });

  const sendToRealtime = (payload: object) => {
    if (!realtime || realtime.readyState !== WebSocket.OPEN) return;
    realtime.send(JSON.stringify(payload));
  };

  const expectedInputFormat = useAudioSchema
    ? { type: audioMode === "pcmu" ? "audio/pcmu" : "audio/pcm", rate: outputSampleRate }
    : { type: audioMode === "pcmu" ? "g711_ulaw" : "pcm16", rate: null };
  const expectedOutputFormat = useAudioSchema
    ? { type: audioMode === "pcmu" ? "audio/pcmu" : "audio/pcm", rate: outputSampleRate }
    : { type: audioMode === "pcmu" ? "g711_ulaw" : "pcm16", rate: null };

  const failFast = (reason: string, details?: unknown) => {
    console.error(`${logPrefix(wsId)} session.validation.failed`, reason, details ?? "");
    if (realtime && realtime.readyState === WebSocket.OPEN) {
      realtime.close();
    }
    ws.close();
  };

  const validateSession = (payload: RealtimeEvent) => {
    const session = (payload as { session?: Record<string, unknown> }).session;
    if (!session) return;
    if (payload.type === "session.created") {
      // Allow defaults on created; enforce on session.updated after our update applies.
      return;
    }
    if (useAudioSchema) {
      const audio = session.audio as
        | {
            input?: { format?: { type?: string; rate?: number }; transcription?: { model?: string } };
            output?: { format?: { type?: string; rate?: number } };
          }
        | undefined;
      const input = audio?.input?.format;
      const output = audio?.output?.format;
      const transcriptionModel = audio?.input?.transcription?.model;
      const ok =
        input?.type === expectedInputFormat.type &&
        input?.rate === expectedInputFormat.rate &&
        output?.type === expectedOutputFormat.type &&
        output?.rate === expectedOutputFormat.rate &&
        transcriptionModel === config.realtimeTranscriptionModel;
      console.log(`${logPrefix(wsId)} session.validation`, {
        ok,
        input,
        output,
        transcriptionModel,
      });
      if (!ok) {
        failFast("audio schema mismatch", { expectedInputFormat, expectedOutputFormat, transcriptionModel });
      }
      return;
    }
    const input = session.input_audio_format;
    const output = session.output_audio_format;
    const transcriptionModel = (session.input_audio_transcription as { model?: string } | undefined)?.model;
    const ok =
      input === expectedInputFormat.type &&
      output === expectedOutputFormat.type &&
      transcriptionModel === config.realtimeTranscriptionModel;
    console.log(`${logPrefix(wsId)} session.validation`, {
      ok,
      input,
      output,
      transcriptionModel,
    });
    if (!ok) {
      failFast("flat schema mismatch", { expectedInputFormat, expectedOutputFormat });
    }
  };

  const logOutgoing = (label: string, payload: object) => {
    console.log(`${logPrefix(wsId)} realtime send ${label}`, JSON.stringify(payload));
  };

  const logClient = createLogClient();
  if (!logClient) {
    console.warn(`${logPrefix(wsId)} log client disabled (LOG_API_BASE_URL not set)`);
  }

  const createResponse = (instructions?: string) => {
    if (!instructions) return;
    if (responseActive || responsePending) {
      queuedPrompt = instructions;
      console.log(`${logPrefix(wsId)} skip response.create (active/pending)`);
      return;
    }
    const payload = useAudioSchema
      ? {
          type: "response.create",
          response: {
            audio: {
              output: {
                format: {
                  type: audioMode === "pcmu" ? "audio/pcmu" : "audio/pcm",
                  rate: outputSampleRate,
                },
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
            output_audio_format: audioMode === "pcmu" ? "g711_ulaw" : "pcm16",
            voice: "alloy",
            ...(instructions ? { instructions } : {}),
          },
        };
    logOutgoing("response.create", payload);
    responsePending = true;
    lastAssistantPrompt = instructions;
    sendToRealtime(payload);
    if (logClient && callLogId) {
      logClient.appendMessage(callLogId, {
        role: "assistant",
        content: instructions,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      });
    }
  };

  const flushAssistantTranscript = () => {
    if (!assistantTranscript.trim()) return;
    if (logClient && callLogId) {
      logClient.appendMessage(callLogId, {
        role: "assistant",
        content: assistantTranscript.trim(),
        started_at: assistantTranscriptStartedAt || new Date().toISOString(),
        ended_at: new Date().toISOString(),
      });
    }
    assistantTranscript = "";
    assistantTranscriptStartedAt = null;
  };

  const processCommittedTurn = () => {
    if (!commitPending) return;
    if (!pendingTranscript) return;
    const transcript = pendingTranscript;
    pendingTranscript = null;
    commitPending = false;
    if (commitTimer) {
      clearTimeout(commitTimer);
      commitTimer = null;
    }
    if (responseActive || responsePending) {
      queuedUserTranscript = { text: transcript.text, confidence: transcript.confidence };
      console.log(`${logPrefix(wsId)} queue transcript (assistant speaking)`, transcript.text);
      return;
    }
    if (lastAssistantDoneAt && Date.now() - lastAssistantDoneAt < echoSuppressionMs) {
      console.log(`${logPrefix(wsId)} skip transcript (cooldown)`, {
        text: transcript.text,
        sinceMs: Date.now() - lastAssistantDoneAt,
      });
      return;
    }
    const normalizeForCompare = (text: string) =>
      text
        .normalize("NFKC")
        .toLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, "");
    const normalizedTranscript = normalizeForCompare(transcript.text);
    const normalizedPrompt = normalizeForCompare(lastAssistantPrompt);
    const echoWindowMs = 3000;
    if (
      normalizedPrompt &&
      normalizedTranscript.length >= 4 &&
      Date.now() - lastAssistantDoneAt < echoWindowMs &&
      (normalizedPrompt.includes(normalizedTranscript) ||
        normalizedTranscript.includes(normalizedPrompt))
    ) {
      console.log(`${logPrefix(wsId)} skip transcript (echo)`, transcript.text);
      return;
    }
    if (logClient && callLogId) {
      logClient.appendMessage(callLogId, {
        role: "user",
        content: transcript.text,
        started_at: new Date().toISOString(),
        ended_at: new Date().toISOString(),
      });
    }
    conversation.onUserTranscript(transcript.text, transcript.confidence);
  };

  const markCommitted = () => {
    commitPending = true;
    conversation.onUserCommitted();
    processCommittedTurn();
    if (!commitTimer) {
      commitTimer = setTimeout(() => {
        if (!commitPending) return;
        commitPending = false;
        commitTimer = null;
        console.log(`${logPrefix(wsId)} committed without transcript`);
      }, 500);
    }
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

  const conversation = createConversationController({
    catalog: productCatalog,
    toolClient,
    config: {
      silenceTimeoutMs: config.silenceTimeoutMs,
      silenceRetriesMax: config.silenceRetriesMax,
      noHearRetriesMax: config.noHearRetriesMax,
      silenceAutoPromptEnabled: config.silenceAutoPromptEnabled,
      noHearAutoPromptEnabled: config.noHearAutoPromptEnabled,
      sttConfidenceThreshold: config.sttConfidenceThreshold,
      correctionKeywords: config.correctionKeywords,
      orderRetryMax: config.orderRetryMax,
      deliveryRetryMax: config.deliveryRetryMax,
    },
    onPrompt: (message) => {
      const prompt = message || config.testPrompt;
      if (!prompt) return;
      createResponse(prompt);
    },
    onLog: (message, data) => {
      console.log(`${logPrefix(wsId)} ${message}`, data ?? "");
    },
    onInquiryUpdate: (payload) => {
      if (!logClient) {
        console.warn(`${logPrefix(wsId)} inquiry.skip no log client`, payload);
        return;
      }
      if (!callLogId) {
        console.warn(`${logPrefix(wsId)} inquiry.skip no callLogId`, payload);
        return;
      }
      logClient.upsertInquiry({
        call_id: callLogId,
        brand: payload.brand,
        weight_kg: payload.weightKg,
        delivery_address: payload.deliveryAddress,
        delivery_date: payload.deliveryDate,
        note: payload.note,
      });
      console.log(`${logPrefix(wsId)} inquiry.upsert`, payload);
    },
  });

  const maybeStartConversation = () => {
    if (conversationStarted) return;
    if (!realtimeReady || !streamSid) return;
    conversationStarted = true;
    conversation.start();
  };

  realtime = createRealtimeSocket();
  if (realtime) {
    realtime.on("open", () => {
      realtimeReady = true;
      if (!config.realtimeTranscriptionModel) {
        console.error(`${logPrefix(wsId)} missing REALTIME_TRANSCRIPTION_MODEL`);
        realtime.close();
        ws.close();
        return;
      }
      const inputAudio = {
        format: {
          type: audioMode === "pcmu" ? "audio/pcmu" : "audio/pcm",
          rate: outputSampleRate,
        },
        transcription: { model: config.realtimeTranscriptionModel },
        turn_detection: {
          type: "server_vad",
          silence_duration_ms: 800,
          create_response: false,
          interrupt_response: true,
        },
      };
      const payload = useAudioSchema
        ? {
            type: "session.update",
            session: {
              type: "realtime",
              instructions: config.realtimeInstructions,
              audio: {
                input: inputAudio,
                output: {
                  format: {
                    type: audioMode === "pcmu" ? "audio/pcmu" : "audio/pcm",
                    rate: outputSampleRate,
                  },
                  voice: "alloy",
                },
              },
              output_modalities: ["audio"],
            },
          }
        : {
          type: "session.update",
          session: {
            instructions: config.realtimeInstructions,
            input_audio_format: audioMode === "pcmu" ? "g711_ulaw" : "pcm16",
            output_audio_format: audioMode === "pcmu" ? "g711_ulaw" : "pcm16",
            voice: "alloy",
            modalities: ["audio", "text"],
            input_audio_transcription: { model: config.realtimeTranscriptionModel },
            turn_detection: {
              type: "server_vad",
              silence_duration_ms: 800,
              create_response: false,
              interrupt_response: true,
            },
          },
        };
      logOutgoing("session.update", payload);
      sendToRealtime(payload);
      console.log(`${logPrefix(wsId)} realtime connected`);
      maybeStartConversation();
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
      }
      const userTranscript = extractUserTranscript(payload);
      if (userTranscript) {
        pendingTranscript = { ...userTranscript, ts: Date.now() };
        processCommittedTurn();
      }
      if (payload.type === "session.created" && !sessionCreatedLogged) {
        sessionCreatedLogged = true;
        console.log(`${logPrefix(wsId)} session.created payload`, JSON.stringify(payload, null, 2));
        validateSession(payload);
      }
      if (payload.type === "session.updated") {
        validateSession(payload);
        // Ensure greeting is sent after session is fully configured.
        maybeStartConversation();
      }
      if (payload.type === "response.output_audio.delta" || payload.type === "response.audio.delta") {
        const delta = payload.delta as string | undefined;
        if (delta) {
          if (useAudioSchema) {
            if (audioMode === "pcmu") {
              sendToTwilio(delta);
              console.log(`${logPrefix(wsId)} realtime audio delta bytes`, Buffer.from(delta, "base64").length);
            } else {
              const pcm = Buffer.from(delta, "base64");
              const pcm16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
              const downsampled = downsample(pcm16, resampleFactor);
              const mulaw = encodePcm16ToPcmu(downsampled);
              sendToTwilio(mulaw.toString("base64"));
              console.log(`${logPrefix(wsId)} realtime audio delta bytes`, pcm.byteLength);
            }
          } else {
            sendToTwilio(delta);
            console.log(`${logPrefix(wsId)} realtime audio delta bytes`, Buffer.from(delta, "base64").length);
          }
        }
        return;
      }
      if (
        payload.type === "response.output_audio_transcript.delta" ||
        payload.type === "response.audio_transcript.delta"
      ) {
        const delta =
          (payload as { delta?: string; transcript?: string; text?: string }).delta ??
          (payload as { transcript?: string }).transcript ??
          (payload as { text?: string }).text;
        if (typeof delta === "string" && delta) {
          if (!assistantTranscriptStartedAt) {
            assistantTranscriptStartedAt = new Date().toISOString();
          }
          assistantTranscript += delta;
        }
      }
      if (payload.type === "output_audio_buffer.audio") {
        const audio = payload.audio as string | undefined;
        if (audio) {
          if (useAudioSchema) {
            if (audioMode === "pcmu") {
              sendToTwilio(audio);
            } else {
              const pcm = Buffer.from(audio, "base64");
              const pcm16 = new Int16Array(pcm.buffer, pcm.byteOffset, pcm.byteLength / 2);
              const downsampled = downsample(pcm16, resampleFactor);
              const mulaw = encodePcm16ToPcmu(downsampled);
              sendToTwilio(mulaw.toString("base64"));
            }
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
        if (!responsePending && !responseActive) {
          console.warn(`${logPrefix(wsId)} response.created (unexpected)`, {
            id: (payload as { response_id?: string }).response_id,
          });
          logOutgoing("response.cancel", { type: "response.cancel" });
          sendToRealtime({ type: "response.cancel" });
        }
        responseActive = true;
        responsePending = false;
        assistantTranscript = "";
        assistantTranscriptStartedAt = new Date().toISOString();
        conversation.onAssistantStart();
      }
      if (
        payload.type === "response.output_audio_transcript.done" ||
        payload.type === "response.audio_transcript.done"
      ) {
        flushAssistantTranscript();
      }
      if (payload.type === "response.done") {
        responseActive = false;
        responsePending = false;
        lastAssistantDoneAt = Date.now();
        flushAssistantTranscript();
        conversation.onAssistantDone();
        if (queuedUserTranscript) {
          const queued = queuedUserTranscript;
          queuedUserTranscript = null;
          conversation.onUserTranscript(queued.text, queued.confidence);
        }
        if (queuedPrompt) {
          const pending = queuedPrompt;
          queuedPrompt = null;
          createResponse(pending);
        }
        if (lastOutputItemId) {
          sendToRealtime({
            type: "conversation.item.retrieve",
            item_id: lastOutputItemId,
          });
        }
      }
      if (payload.type === "input_audio_buffer.speech_started") {
        if (responseActive || responsePending) {
          logOutgoing("response.cancel", { type: "response.cancel" });
          sendToRealtime({ type: "response.cancel" });
          responseActive = false;
          responsePending = false;
          queuedPrompt = null;
        }
        conversation.onSpeechStarted();
      }
      if (payload.type === "input_audio_buffer.speech_stopped") {
        conversation.onSpeechStopped();
      }
      if (payload.type === "input_audio_buffer.committed") {
        markCommitted();
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
        if (event.start.customParameters) {
          const { customer_phone: customerPhone, address } = event.start.customParameters;
          conversation.setCustomerPhone(customerPhone);
          conversation.setAddress(address);
        }
        if (logClient && !callLogId) {
          const nowIso = new Date().toISOString();
          const payload = {
            customer_id: null,
            started_at: nowIso,
            from_number: event.start.customParameters?.customer_phone || event.start.callSid,
            to_number: null,
            call_type: "inbound",
            status: "in-progress",
            provider: "twilio",
            provider_call_sid: event.start.callSid,
          };
          logClient.createCall(payload).then((res) => {
            const id = res?.data?.id || res?.data?.attributes?.id;
            if (id) {
              callLogId = String(id);
              console.log(`${logPrefix(wsId)} callLogId set`, callLogId);
            } else {
              console.warn(`${logPrefix(wsId)} callLogId missing in response`, res);
            }
          });
        }
        if (config.testTwilioTone && !testToneSent) {
          const tone = generateBeepPcmu(440, 600);
          sendToTwilio(tone.toString("base64"));
          testToneSent = true;
          console.log(`${logPrefix(wsId)} sent test tone`);
        }
        maybeStartConversation();
        break;
      case "media":
        mediaCount += 1;
        if (mediaCount === 1 || mediaCount % 50 === 0) {
          console.log(`${logPrefix(wsId)} media chunks`, mediaCount);
        }
        if (realtimeReady) {
          if (useAudioSchema) {
            if (audioMode === "pcmu") {
              sendToRealtime({ type: "input_audio_buffer.append", audio: event.media.payload });
            } else {
              const pcmu = Buffer.from(event.media.payload, "base64");
              const pcm16 = decodePcmuToPcm16(pcmu);
              const upsampled = upsample(pcm16, resampleFactor);
              const pcmBuffer = Buffer.from(upsampled.buffer);
              sendToRealtime({
                type: "input_audio_buffer.append",
                audio: pcmBuffer.toString("base64"),
              });
              if (!vadEnabled) {
                audioFrameCount += 1;
                bufferedSamples += upsampled.length;
                if (audioFrameCount >= config.realtimeCommitFrames && bufferedSamples >= minCommitSamples) {
                  sendToRealtime({ type: "input_audio_buffer.commit" });
                  audioFrameCount = 0;
                  bufferedSamples = 0;
                }
              }
            }
          } else {
            if (audioMode === "pcmu") {
              sendToRealtime({ type: "input_audio_buffer.append", audio: event.media.payload });
            } else {
              const pcmu = Buffer.from(event.media.payload, "base64");
              const pcm16 = decodePcmuToPcm16(pcmu);
              const upsampled = upsample(pcm16, resampleFactor);
              const pcmBuffer = Buffer.from(upsampled.buffer);
              sendToRealtime({
                type: "input_audio_buffer.append",
                audio: pcmBuffer.toString("base64"),
              });
            }
          }
          hasBufferedAudio = true;
        }
        break;
      case "stop":
        stopReceived = true;
        console.log(`${logPrefix(wsId)} stream stopped`);
        hasBufferedAudio = false;
        if (!vadEnabled && realtimeReady && useAudioSchema && bufferedSamples >= minCommitSamples) {
          sendToRealtime({ type: "input_audio_buffer.commit" });
          audioFrameCount = 0;
          bufferedSamples = 0;
        }
        if (logClient && callLogId && !callLogEnded) {
          callLogEnded = true;
          logClient.updateCall(callLogId, {
            ended_at: new Date().toISOString(),
            duration_sec: null,
            status: "completed",
          });
        }
        break;
      default:
        break;
    }
  });

  ws.on("close", (code, reason) => {
    console.log(`${logPrefix(wsId)} disconnected`, {
      code,
      reason: reason.toString(),
      stopReceived,
      closedBy: "peer",
      closedAtMs: Date.now(),
    });
    if (logClient && callLogId && !callLogEnded) {
      callLogEnded = true;
      logClient.updateCall(callLogId, {
        ended_at: new Date().toISOString(),
        duration_sec: null,
        status: stopReceived ? "completed" : "ended",
      });
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
