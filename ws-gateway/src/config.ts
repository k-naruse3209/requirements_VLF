export const config = {
  port: Number(process.env.WS_PORT || 8080),
  realtimeUrl: process.env.REALTIME_URL || "wss://api.openai.com/v1/realtime",
  realtimeModel: process.env.REALTIME_MODEL || "gpt-4o-realtime-preview",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  testPrompt: process.env.TEST_PROMPT || "",
  realtimeBetaHeader: process.env.REALTIME_BETA_HEADER !== "0",
  realtimeSchema: process.env.REALTIME_SCHEMA || "flat",
  realtimeAudioMode: process.env.REALTIME_AUDIO_MODE || "pcmu",
  realtimeAudioRate: Number(process.env.REALTIME_AUDIO_RATE || 24000),
  realtimeCommitFrames: Number(process.env.REALTIME_COMMIT_FRAMES || 50),
  realtimeTranscriptionModel: process.env.REALTIME_TRANSCRIPTION_MODEL || "",
  realtimeInterruptResponse: process.env.REALTIME_INTERRUPT_RESPONSE !== "0",
  bargeInCancelEnabled: process.env.BARGE_IN_CANCEL === "1",
  realtimeVadSilenceMs: Number(process.env.REALTIME_VAD_SILENCE_MS || 800),
  realtimeInstructions:
    process.env.REALTIME_INSTRUCTIONS ||
    [
      "You are the speech renderer for a deterministic call state machine.",
      "Always speak in Japanese.",
      "For each response, speak only the sentence provided in response.instructions.",
      "Do not paraphrase, add options, infer slot values, or ask extra questions.",
      "After speaking one sentence, wait for the user's next utterance.",
    ].join(" "),
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
  orderRetryMax: Number(process.env.ORDER_RETRY_MAX || 1),
  deliveryRetryMax: Number(process.env.DELIVERY_RETRY_MAX || 1),
  productCatalogPath: process.env.PRODUCT_CATALOG_PATH || "",
};
