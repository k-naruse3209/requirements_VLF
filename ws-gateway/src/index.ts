import http from "node:http";
import fs from "node:fs";
import { WebSocketServer, WebSocket } from "ws";
import { config } from "./config.js";
import { createConversationController, type Product } from "./conversation.js";
import { createToolClient } from "./tools.js";
import {
  convertRealtimeAudioToTwilioPcmu,
  decodePcmuToPcm16,
  generateBeepPcmu,
  upsample,
  TWILIO_SAMPLE_RATE,
  type RealtimeAudioEncoding,
} from "./audio.js";

type TwilioEvent =
  | { event: "connected" }
  | {
      event: "start";
      start: {
        streamSid: string;
        callSid: string;
        customParameters?: Record<string, string>;
        tracks?: string[];
      };
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

const safeJson = (data: string): unknown => {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
};

const logPrefix = (wsId: string) => `[ws:${wsId}]`;
const verboseRealtimeLogs = process.env.REALTIME_VERBOSE_EVENTS === "1";

const buildVerbatimInstructions = (verbatimText: string) => {
  // Best-effort: model can still deviate, but this significantly reduces paraphrasing.
  // Keep this SHORT to avoid instruction dilution.
  return [
    "次の文章を一字一句そのまま読み上げてください。",
    "言い換え・補足・前置き・語尾の追加は禁止です。",
    "文章の内容を変えず、ちょうど同じ文字列で出力してください。",
    "",
    "=== 読み上げ文 ===",
    verbatimText,
  ].join("\n");
};

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
      const parsedConfidence =
        typeof confidence === "number" && Number.isFinite(confidence) ? confidence : null;
      return { text, confidence: parsedConfidence };
    }
  }
  if (payload.type === "conversation.item.input_audio_transcription.completed") {
    if (verboseRealtimeLogs) {
      console.log(
        `${logPrefix("transcription")} input_audio_transcription.completed`,
        JSON.stringify(payload)
      );
    }
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

const summarizeCatalog = (catalog: Product[]) => {
  const weights = new Set<number>();
  const brands = new Set<string>();
  for (const item of catalog) {
    if (item.category) brands.add(item.category);
    const match = item.name.normalize("NFKC").match(/(\d+(?:\.\d+)?)\s*(?:kg|キロ)/i);
    if (match?.[1]) {
      const weight = Number(match[1]);
      if (Number.isFinite(weight)) weights.add(weight);
    }
  }
  return {
    brands: Array.from(brands).sort(),
    weightsKg: Array.from(weights).sort((a, b) => a - b),
  };
};

const productCatalog = loadCatalog();
if (config.productCatalogPath) {
  const summary = summarizeCatalog(productCatalog);
  console.log("[catalog] loaded", {
    count: productCatalog.length,
    path: config.productCatalogPath,
    brands: summary.brands,
    weightsKg: summary.weightsKg,
  });
} else {
  console.warn("[catalog] no PRODUCT_CATALOG_PATH configured");
}
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
  let sessionConfigured = false;
  let hasBufferedAudio = false;
  let responseActive = false;
  let responsePending = false;
  let lastOutputItemId = "";
  let sessionCreatedLogged = false;
  let audioFrameCount = 0;
  let bufferedSamples = 0;
  let commitPending = false;
  let commitTimer: NodeJS.Timeout | null = null;
  const promptQueue: string[] = [];
  let conversationStarted = false;
  let stopReceived = false;
  let callLogId: string | null = null;
  let callLogEnded = false;
  let testToneSent = false;
  let callSid = "";
  let sessionId = "";
  const useAudioSchema = config.realtimeSchema === "audio";
  const audioMode = config.realtimeAudioMode === "pcm16" ? "pcm16" : "pcmu";
  let realtimeOutputEncoding: RealtimeAudioEncoding = audioMode;
  const outputSampleRate = audioMode === "pcmu" ? TWILIO_SAMPLE_RATE : config.realtimeAudioRate;
  const resampleFactor =
    audioMode === "pcmu" ? 1 : Math.max(1, Math.round(outputSampleRate / TWILIO_SAMPLE_RATE));
  const minCommitSamples = Math.ceil(outputSampleRate / 10);
  const vadEnabled = true;
  let pendingTranscript: { text: string; confidence: number | null; ts: number } | null = null;
  let queuedUserTranscript: { text: string; confidence: number | null } | null = null;
  let assistantTranscript = "";
  let assistantTranscriptStartedAt: string | null = null;
  let lastAssistantPrompt = "";
  let lastAssistantDoneAt = 0;
  let lastCommitAt = 0;
  let awaitingTranscriptUntil = 0;
  const transcriptWaitMs = 2000;
  const echoSuppressionMs = 800;
  let bytesWindowStart = Date.now();
  let bytesInWindow = 0;
  let bytesInLastSecond = 0;
  let lastInputEvent: { type: string; at: number; audioStartMs?: number; audioEndMs?: number } | null = null;
  let lastTimeoutTriggeredAt = 0;
  let responseSeq = 0;
  const pendingResponseRequests = new Map<string, { ts: number; prompt: string }>();
  let cancelInFlight = false;
  let cancelRequestedAt = 0;
  let bargeInCancelTimer: NodeJS.Timeout | null = null;
  let lastTwilioAudioSentAt = 0;
  const cancelDedupWindowMs = 1200;
  const bargeInCancelFallbackMs = 180;

  console.log(`${logPrefix(wsId)} connected`);
  console.log(`${logPrefix(wsId)} audio.pipeline`, {
    twilioInput: `audio/pcmu@${TWILIO_SAMPLE_RATE}`,
    twilioOutput: `audio/pcmu@${TWILIO_SAMPLE_RATE}`,
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
    conversion:
      audioMode === "pcmu"
        ? "inbound passthrough / outbound enforced pcmu@8k"
        : `inbound pcmu->pcm16@${outputSampleRate} / outbound pcm16->pcmu@8k`,
    interruptResponse: config.realtimeInterruptResponse,
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

  const parseRealtimeOutputEncoding = (formatType: unknown): RealtimeAudioEncoding => {
    if (formatType === "audio/pcmu" || formatType === "g711_ulaw") {
      return "pcmu";
    }
    return "pcm16";
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
      realtimeOutputEncoding = parseRealtimeOutputEncoding(output?.type);
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
    realtimeOutputEncoding = parseRealtimeOutputEncoding(output);
  };

  const logOutgoing = (label: string, payload: object) => {
    console.log(`${logPrefix(wsId)} realtime send ${label}`, JSON.stringify(payload));
  };

  const updateBytesWindow = (bytes: number) => {
    const now = Date.now();
    if (now - bytesWindowStart >= 1000) {
      bytesInLastSecond = bytesInWindow;
      bytesInWindow = 0;
      bytesWindowStart = now;
    }
    bytesInWindow += bytes;
  };

  const logServerEvent = (payload: RealtimeEvent, extra?: Record<string, unknown>) => {
    const responseId = (payload as { response_id?: string }).response_id;
    const itemId =
      (payload as { item_id?: string }).item_id ||
      (payload as { item?: { id?: string } }).item?.id;
    const audioStartMs = (payload as { audio_start_ms?: number }).audio_start_ms;
    const audioEndMs = (payload as { audio_end_ms?: number }).audio_end_ms;
    const reason =
      (payload as { reason?: string }).reason ||
      (payload as { error?: { code?: string; message?: string } }).error?.code ||
      (payload as { error?: { message?: string } }).error?.message;
    const eventLog = {
      ts: new Date().toISOString(),
      callSid,
      sessionId,
      type: payload.type,
      responseId,
      itemId,
      audioStartMs,
      audioEndMs,
      streamBytesIn1s: bytesInLastSecond,
      reason,
      ...extra,
    };
    console.log(`${logPrefix(wsId)} event`, JSON.stringify(eventLog));
  };

  const loggableEvents = new Set([
    "session.created",
    "session.updated",
    "input_audio_buffer.speech_started",
    "input_audio_buffer.speech_stopped",
    "input_audio_buffer.committed",
    "input_audio_buffer.timeout_triggered",
    "conversation.item.created",
    "conversation.item.input_audio_transcription.completed",
    "response.created",
    "response.cancelled",
    "response.canceled",
    "response.done",
    "error",
  ]);

  const logRealtimeEventName = (type?: string) => {
    if (!type || !loggableEvents.has(type)) return;
    console.log(`${logPrefix(wsId)} [REALTIME] event=${type}`);
  };

  const logClient = createLogClient();
  if (!logClient) {
    console.warn(`${logPrefix(wsId)} log client disabled (LOG_API_BASE_URL not set)`);
  }

  const createResponse = (instructions?: string) => {
    const spokenText = instructions?.trim();
    if (!spokenText) return;
    if (responseActive || responsePending) {
      promptQueue.push(spokenText);
      console.log(`${logPrefix(wsId)} queue response.create (active/pending)`, {
        queued: promptQueue.length,
      });
      return;
    }
    const requestId = `gw_${Date.now()}_${++responseSeq}`;
    const responseInstruction = config.realtimeVerbatimEnabled
      ? "直前に追加したassistantメッセージをそのまま読み上げてください。追加・言い換えはしないでください。"
      : "直前に追加したassistantメッセージを短く丁寧に読み上げてください。";
    const verbatimResponseOverrides = config.realtimeVerbatimEnabled
      ? {
          max_output_tokens: config.realtimeMaxResponseOutputTokens,
        }
      : {};
    const conversationItemPayload = {
      type: "conversation.item.create",
      item: {
        type: "message",
        role: "assistant",
        content: [{ type: "input_text", text: spokenText }],
      },
    };
    const payload = useAudioSchema
      ? {
          type: "response.create",
          response: {
            ...verbatimResponseOverrides,
            audio: {
              output: {
                format: {
                  type: audioMode === "pcmu" ? "audio/pcmu" : "audio/pcm",
                  rate: outputSampleRate,
                },
                voice: "alloy",
              },
            },
            instructions: responseInstruction,
            metadata: { client_request_id: requestId, source: "gateway" },
          },
        }
      : {
          type: "response.create",
          response: {
            ...verbatimResponseOverrides,
            modalities: ["audio", "text"],
            output_audio_format: audioMode === "pcmu" ? "g711_ulaw" : "pcm16",
            voice: "alloy",
            instructions: responseInstruction,
            metadata: { client_request_id: requestId, source: "gateway" },
          },
        };
    logOutgoing("conversation.item.create", conversationItemPayload);
    sendToRealtime(conversationItemPayload);
    logOutgoing("response.create", payload);
    responsePending = true;
    lastAssistantPrompt = spokenText;
    pendingResponseRequests.set(requestId, { ts: Date.now(), prompt: spokenText });
    sendToRealtime(payload);
    if (logClient && callLogId) {
      logClient.appendMessage(callLogId, {
        role: "assistant",
        content: spokenText,
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
    const now = Date.now();
    if (!pendingTranscript) return;
    if (!commitPending) {
      if (!lastCommitAt) {
        const ageMs = now - pendingTranscript.ts;
        if (ageMs > 8000) {
          console.log(`${logPrefix(wsId)} skip transcript (no commit timeout)`, {
            text: pendingTranscript.text,
            ageMs,
          });
          pendingTranscript = null;
        } else {
          console.log(`${logPrefix(wsId)} wait transcript (before commit)`, {
            text: pendingTranscript.text,
            ageMs,
          });
        }
        return;
      }
      const commitAgeMs = now - lastCommitAt;
      const lateAcceptWindowMs = Math.max(transcriptWaitMs * 4, 8000);
      if (commitAgeMs > lateAcceptWindowMs) {
        console.log(`${logPrefix(wsId)} skip transcript (stale commit)`, {
          text: pendingTranscript.text,
          commitAgeMs,
        });
        pendingTranscript = null;
        return;
      }
      if (commitAgeMs > transcriptWaitMs) {
        console.log(`${logPrefix(wsId)} accept transcript (late)`, {
          text: pendingTranscript.text,
          commitAgeMs,
        });
      }
    }
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
    lastCommitAt = Date.now();
    awaitingTranscriptUntil = lastCommitAt + transcriptWaitMs;
    conversation.onUserCommitted();
    processCommittedTurn();
    if (!commitTimer) {
      commitTimer = setTimeout(() => {
        if (!commitPending) return;
        commitPending = false;
        commitTimer = null;
        console.log(`${logPrefix(wsId)} committed without transcript`);
      }, transcriptWaitMs);
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

  const sendRealtimeAudioToTwilio = (audioBase64: string, source: string) => {
    const twilioPayload = convertRealtimeAudioToTwilioPcmu(
      audioBase64,
      realtimeOutputEncoding,
      resampleFactor
    );
    if (!twilioPayload) {
      console.warn(`${logPrefix(wsId)} drop realtime audio`, {
        source,
        realtimeOutputEncoding,
      });
      return;
    }
    sendToTwilio(twilioPayload);
    lastTwilioAudioSentAt = Date.now();
  };

  const clearPendingBargeInCancel = () => {
    if (!bargeInCancelTimer) return;
    clearTimeout(bargeInCancelTimer);
    bargeInCancelTimer = null;
  };

  const sendTwilioClear = (reason: string) => {
    if (!streamSid) return false;
    ws.send(
      JSON.stringify({
        event: "clear",
        streamSid,
      })
    );
    console.log(`${logPrefix(wsId)} twilio clear`, { reason, streamSid });
    return true;
  };

  const requestResponseCancel = (reason: string, force = false) => {
    const now = Date.now();
    if (!force && !(responseActive || responsePending)) {
      console.log(`${logPrefix(wsId)} response.cancel skipped`, {
        reason,
        responseActive,
        responsePending,
      });
      return false;
    }
    if (cancelInFlight && now - cancelRequestedAt < cancelDedupWindowMs) {
      console.log(`${logPrefix(wsId)} response.cancel deduped`, {
        reason,
        sinceMs: now - cancelRequestedAt,
      });
      return false;
    }
    cancelInFlight = true;
    cancelRequestedAt = now;
    logOutgoing("response.cancel", { type: "response.cancel" });
    sendToRealtime({ type: "response.cancel" });
    return true;
  };

  const scheduleBargeInCancelFallback = (source: string) => {
    if (!config.bargeInCancelEnabled) return false;
    if (!(responseActive || responsePending)) return false;
    clearPendingBargeInCancel();
    bargeInCancelTimer = setTimeout(() => {
      bargeInCancelTimer = null;
      if (!(responseActive || responsePending)) return;
      requestResponseCancel(`${source}:fallback`);
    }, bargeInCancelFallbackMs);
    return true;
  };

  const handleBargeIn = (source: string) => {
    const sinceLastAudioMs = lastTwilioAudioSentAt
      ? Date.now() - lastTwilioAudioSentAt
      : Number.POSITIVE_INFINITY;
    const shouldClear =
      responseActive ||
      responsePending ||
      sinceLastAudioMs <= config.bargeInTwilioClearWindowMs;
    const clearSent = shouldClear ? sendTwilioClear(source) : false;
    promptQueue.length = 0;
    queuedUserTranscript = null;
    const fallbackScheduled = scheduleBargeInCancelFallback(source);
    console.log(`${logPrefix(wsId)} bargein`, {
      source,
      shouldClear,
      clearSent,
      sinceLastAudioMs,
      fallbackScheduled,
      responseActive,
      responsePending,
    });
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
    if (!realtimeReady || !streamSid || !sessionConfigured) return;
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
      const sessionMaxResponseTokens = config.realtimeVerbatimEnabled
        ? config.realtimeMaxResponseOutputTokens
        : "inf";
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
          interrupt_response: config.realtimeInterruptResponse,
        },
      };
      const payload = useAudioSchema
        ? {
            type: "session.update",
            session: {
              type: "realtime",
              instructions: config.realtimeInstructions,
              temperature: config.realtimeTemperature,
              max_response_output_tokens: sessionMaxResponseTokens,
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
              temperature: config.realtimeTemperature,
              max_response_output_tokens: sessionMaxResponseTokens,
            input_audio_format: audioMode === "pcmu" ? "g711_ulaw" : "pcm16",
            output_audio_format: audioMode === "pcmu" ? "g711_ulaw" : "pcm16",
            voice: "alloy",
            modalities: ["audio", "text"],
            input_audio_transcription: { model: config.realtimeTranscriptionModel },
            turn_detection: {
              type: "server_vad",
              silence_duration_ms: 800,
              create_response: false,
              interrupt_response: config.realtimeInterruptResponse,
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
          if (verboseRealtimeLogs) {
            console.log(`${logPrefix(wsId)} realtime binary audio`, buffer.length);
          }
          sendRealtimeAudioToTwilio(audio, "realtime.binary");
        }
        return;
      }
      const payload = safeJson(data.toString()) as RealtimeEvent | null;
      if (!payload) return;
      logRealtimeEventName(payload.type);
      if (payload.type?.startsWith("input_audio_buffer.")) {
        const audioStartMs = (payload as { audio_start_ms?: number }).audio_start_ms;
        const audioEndMs = (payload as { audio_end_ms?: number }).audio_end_ms;
        lastInputEvent = {
          type: payload.type,
          at: Date.now(),
          audioStartMs,
          audioEndMs,
        };
        if (payload.type === "input_audio_buffer.timeout_triggered") {
          lastTimeoutTriggeredAt = Date.now();
        }
        logServerEvent(payload);
      }
      if (payload.type === "conversation.item.created") {
        logServerEvent(payload);
      }
      if (payload.type === "conversation.item.input_audio_transcription.completed") {
        logServerEvent(payload);
      }
      if (payload.type === "error") {
        console.error(`${logPrefix(wsId)} realtime error event`, payload);
        const error = (payload as { error?: { code?: string } }).error;
        if (error?.code === "conversation_already_has_active_response") {
          responsePending = false;
        }
        if (error?.code === "response_cancel_not_active") {
          cancelInFlight = false;
          clearPendingBargeInCancel();
        }
        logServerEvent(payload, {
          lastInputEvent: lastInputEvent?.type,
          lastInputEventAgeMs: lastInputEvent ? Date.now() - lastInputEvent.at : null,
        });
      }
      const userTranscript = extractUserTranscript(payload);
      if (userTranscript) {
        console.log(`${logPrefix(wsId)} transcript.received`, {
          text: userTranscript.text,
          confidence: userTranscript.confidence,
          commitPending,
          commitAgeMs: lastCommitAt ? Date.now() - lastCommitAt : null,
        });
        pendingTranscript = { ...userTranscript, ts: Date.now() };
        processCommittedTurn();
      }
      if (payload.type === "session.created" && !sessionCreatedLogged) {
        sessionCreatedLogged = true;
        const createdSessionId = (payload as { session?: { id?: string } }).session?.id;
        if (createdSessionId) sessionId = createdSessionId;
        if (verboseRealtimeLogs) {
          console.log(`${logPrefix(wsId)} session.created payload`, JSON.stringify(payload, null, 2));
        }
        validateSession(payload);
      }
      if (payload.type === "session.updated") {
        validateSession(payload);
        sessionConfigured = true;
        // Ensure greeting is sent after session is fully configured.
        maybeStartConversation();
      }
      if (payload.type === "response.output_audio.delta" || payload.type === "response.audio.delta") {
        const delta = payload.delta as string | undefined;
        if (delta) {
          sendRealtimeAudioToTwilio(delta, payload.type);
          if (verboseRealtimeLogs) {
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
          sendRealtimeAudioToTwilio(audio, payload.type);
        }
      }
      if (payload.type === "response.content_part.added") {
        const part = payload.part as { audio?: string | { data?: string } } | undefined;
        if (part?.audio) {
          const audio = typeof part.audio === "string" ? part.audio : part.audio?.data;
          if (audio) {
            sendRealtimeAudioToTwilio(audio, payload.type);
            return;
          }
        }
        if (verboseRealtimeLogs) {
          console.log(`${logPrefix(wsId)} content_part keys`, Object.keys(part || {}));
          console.log(`${logPrefix(wsId)} content_part payload`, JSON.stringify(part || {}));
        }
      }
      if (payload.type === "response.output_item.added") {
        const itemId = (payload as { item?: { id?: string } }).item?.id;
        if (itemId) lastOutputItemId = itemId;
        if (verboseRealtimeLogs) {
          console.log(`${logPrefix(wsId)} output_item payload`, JSON.stringify(payload));
        }
      }
      if (payload.type === "response.created") {
        const response = (payload as { response?: { metadata?: Record<string, unknown> } }).response;
        const clientRequestId = response?.metadata?.client_request_id as string | undefined;
        const expected =
          (clientRequestId && pendingResponseRequests.has(clientRequestId)) ||
          responsePending ||
          responseActive;
        logServerEvent(payload, {
          expected,
          clientRequestId: clientRequestId || null,
          lastInputEvent: lastInputEvent?.type,
          lastInputEventAgeMs: lastInputEvent ? Date.now() - lastInputEvent.at : null,
          timeoutTriggeredMsAgo: lastTimeoutTriggeredAt
            ? Date.now() - lastTimeoutTriggeredAt
            : null,
        });
        if (clientRequestId) pendingResponseRequests.delete(clientRequestId);
        if (!expected) {
          console.warn(`${logPrefix(wsId)} response.created (unexpected)`, {
            id: (payload as { response_id?: string }).response_id,
            clientRequestId,
          });
          handleBargeIn("unexpected_response_created");
          requestResponseCancel("unexpected_response_created", true);
          return;
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
        const completedPrompt = lastAssistantPrompt;
        logServerEvent(payload, {
          lastInputEvent: lastInputEvent?.type,
          lastInputEventAgeMs: lastInputEvent ? Date.now() - lastInputEvent.at : null,
        });
        responseActive = false;
        responsePending = false;
        cancelInFlight = false;
        clearPendingBargeInCancel();
        lastAssistantDoneAt = Date.now();
        flushAssistantTranscript();
        conversation.onAssistantDone(completedPrompt);
        if (queuedUserTranscript) {
          const queued = queuedUserTranscript;
          queuedUserTranscript = null;
          conversation.onUserTranscript(queued.text, queued.confidence);
        }
        if (promptQueue.length > 0) {
          const pending = promptQueue.shift();
          createResponse(pending);
        }
        if (lastOutputItemId) {
          sendToRealtime({
            type: "conversation.item.retrieve",
            item_id: lastOutputItemId,
          });
        }
      }
      if (payload.type === "response.cancelled" || payload.type === "response.canceled") {
        logServerEvent(payload, {
          lastInputEvent: lastInputEvent?.type,
          lastInputEventAgeMs: lastInputEvent ? Date.now() - lastInputEvent.at : null,
        });
        responseActive = false;
        responsePending = false;
        cancelInFlight = false;
        clearPendingBargeInCancel();
        lastAssistantDoneAt = Date.now();
        flushAssistantTranscript();
        if (queuedUserTranscript) {
          const queued = queuedUserTranscript;
          queuedUserTranscript = null;
          conversation.onUserTranscript(queued.text, queued.confidence);
        }
      }
      if (payload.type === "input_audio_buffer.speech_started") {
        if (config.realtimeInterruptResponse) {
          handleBargeIn("speech_started");
        } else {
          console.log(`${logPrefix(wsId)} bargein skipped`, {
            source: "speech_started",
            reason: "REALTIME_INTERRUPT_RESPONSE=0",
          });
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
      case "connected":
        console.log(`${logPrefix(wsId)} [TWILIO] event=connected track=- len=0`);
        break;
      case "start":
        console.log(
          `${logPrefix(wsId)} [TWILIO] event=start track=${
            event.start.tracks?.join("|") || "-"
          } len=0`
        );
        streamSid = event.start.streamSid;
        callSid = event.start.callSid;
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
        const mediaLen = Buffer.byteLength(event.media.payload, "base64");
        if (mediaCount === 1 || mediaCount % 50 === 0) {
          console.log(
            `${logPrefix(wsId)} [TWILIO] event=media track=${event.media.track} len=${mediaLen}`
          );
        }
        if (mediaCount === 1 || mediaCount % 50 === 0) {
          console.log(`${logPrefix(wsId)} media chunks`, mediaCount);
        }
        updateBytesWindow(mediaLen);
        if (realtimeReady) {
          if (!sessionConfigured) {
            if (mediaCount <= 5 || mediaCount % 100 === 0) {
              console.log(
                `${logPrefix(wsId)} drop media until session configured`,
                { mediaCount }
              );
            }
            break;
          }
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
        console.log(`${logPrefix(wsId)} [TWILIO] event=stop track=- len=0`);
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
      case "mark":
        console.log(`${logPrefix(wsId)} [TWILIO] event=mark track=- len=0`);
        break;
      default:
        break;
    }
  });

  ws.on("close", (code, reason) => {
    clearPendingBargeInCancel();
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
