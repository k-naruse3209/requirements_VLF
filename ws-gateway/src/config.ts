import path from "node:path";

const defaultCatalogPath = path.join(process.cwd(), "catalog.json");
const defaultInventoryPath = path.join(process.cwd(), "inventory.json");

export const config = {
  port: Number(process.env.WS_PORT || 8080),
  realtimeUrl: process.env.REALTIME_URL || "wss://api.openai.com/v1/realtime",
  realtimeModel: process.env.REALTIME_MODEL || "gpt-realtime",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  testPrompt: process.env.TEST_PROMPT || "",
  realtimeBetaHeader: process.env.REALTIME_BETA_HEADER !== "0",
  realtimeSchema: process.env.REALTIME_SCHEMA || "flat",
  realtimeAudioMode: process.env.REALTIME_AUDIO_MODE || "pcmu",
  realtimeAudioRate: Number(process.env.REALTIME_AUDIO_RATE || 24000),
  realtimeCommitFrames: Number(process.env.REALTIME_COMMIT_FRAMES || 50),
  realtimeTranscriptionModel: process.env.REALTIME_TRANSCRIPTION_MODEL || "",
  bargeInCancelEnabled: process.env.BARGE_IN_CANCEL === "1",
  // Parity default: keep server-side interrupt on unless explicitly disabled.
  realtimeInterruptResponse: process.env.REALTIME_INTERRUPT_RESPONSE !== "0",
  // Send Twilio clear only when outbound audio was sent recently.
  bargeInTwilioClearWindowMs: Number(process.env.BARGE_IN_CLEAR_WINDOW_MS || 1800),
  // Ignore ultra-short VAD spikes (echo/noise) for barge-in cancel.
  bargeInMinSpeechMs: Number(process.env.BARGE_IN_MIN_SPEECH_MS || 450),
  // Parity default: shorter VAD silence tail.
  realtimeVadSilenceMs: Number(process.env.REALTIME_VAD_SILENCE_MS || 800),
  // Fallback guard in case Twilio mark ACK is not received.
  twilioPlaybackMarkTimeoutMs: Number(process.env.TWILIO_PLAYBACK_MARK_TIMEOUT_MS || 5000),
  featureExplicitConversationItem: process.env.FEATURE_EXPLICIT_CONVERSATION_ITEM !== "0",
  featureVerbatimWrapper: process.env.FEATURE_VERBATIM_WRAPPER !== "0",
  featureInboundDropWhileAssistant: process.env.FEATURE_INBOUND_DROP_WHILE_ASSISTANT !== "0",
  featureTwilioMarkGuard: process.env.FEATURE_TWILIO_MARK_GUARD !== "0",
  featureEmptyCommitToNoHear: process.env.FEATURE_EMPTY_COMMIT_TO_NOHEAR !== "0",
  featureNonJaToNoHear: process.env.FEATURE_NON_JA_TO_NOHEAR !== "0",
  echoSuppressionMs: Number(process.env.ECHO_SUPPRESSION_MS || 2000),
  realtimeInstructions:
    process.env.REALTIME_INSTRUCTIONS ||
    "You are a helpful assistant. Always respond in Japanese. Keep responses to one short sentence and wait for the user's reply.",
  // Realtime "verbatim-ish" tuning (best-effort: cannot guarantee 100% determinism)
  // Realtime beta sessions clamp temperature (currently 0.6–1.2). Use the minimum to reduce variance.
  realtimeTemperature: Number(process.env.REALTIME_TEMPERATURE || 0.6),
  realtimeMaxResponseOutputTokens: process.env.REALTIME_MAX_OUTPUT_TOKENS === "inf"
    ? "inf"
    : Number(process.env.REALTIME_MAX_OUTPUT_TOKENS || 120),
  realtimeVerbatimEnabled: process.env.REALTIME_VERBATIM === "1",
  silenceTimeoutMs: Number(process.env.SILENCE_TIMEOUT_MS || 7000),
  silenceRetriesMax: Number(process.env.SILENCE_RETRIES_MAX || 2),
  noHearRetriesMax: Number(process.env.NOHEAR_RETRIES_MAX || 2),
  silenceAutoPromptEnabled: process.env.SILENCE_AUTO_PROMPT === "1",
  noHearAutoPromptEnabled: process.env.NOHEAR_AUTO_PROMPT === "1",
  sttConfidenceThreshold: Number(process.env.STT_CONFIDENCE_THRESHOLD || 0.55),
  correctionKeywords: (process.env.CORRECTION_KEYWORDS ||
    "やっぱり,違う,他の,間違えた,キャンセル"
  )
    .split(",")
    .map((keyword) => keyword.trim())
    .filter(Boolean),
  logApiBaseUrl: process.env.LOG_API_BASE_URL || "",
  logApiTimeoutMs: Number(process.env.LOG_API_TIMEOUT_MS || 3000),
  testTwilioTone: process.env.TEST_TWILIO_TONE === "1",
  toolBaseUrl: process.env.TOOL_BASE_URL || "",
  toolStockTimeoutMs: Number(process.env.TOOL_STOCK_TIMEOUT_MS || 4000),
  toolPriceTimeoutMs: Number(process.env.TOOL_PRICE_TIMEOUT_MS || 4000),
  toolDeliveryTimeoutMs: Number(process.env.TOOL_DELIVERY_TIMEOUT_MS || 6000),
  toolOrderTimeoutMs: Number(process.env.TOOL_ORDER_TIMEOUT_MS || 4000),
  toolInventoryPath: process.env.TOOL_INVENTORY_PATH || defaultInventoryPath,
  orderRetryMax: Number(process.env.ORDER_RETRY_MAX || 1),
  deliveryRetryMax: Number(process.env.DELIVERY_RETRY_MAX || 1),
  productCatalogPath: process.env.PRODUCT_CATALOG_PATH || defaultCatalogPath,
};
