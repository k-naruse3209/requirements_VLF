export const config = {
  port: Number(process.env.WS_PORT || 8080),
  realtimeUrl: process.env.REALTIME_URL || "wss://api.openai.com/v1/realtime",
  realtimeModel: process.env.REALTIME_MODEL || "gpt-4o-realtime-preview",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
  testPrompt: process.env.TEST_PROMPT || "",
  realtimeBetaHeader: process.env.REALTIME_BETA_HEADER !== "0",
  realtimeSchema: process.env.REALTIME_SCHEMA || "flat",
  realtimeAudioRate: Number(process.env.REALTIME_AUDIO_RATE || 24000),
  realtimeCommitFrames: Number(process.env.REALTIME_COMMIT_FRAMES || 50),
  realtimeInstructions:
    process.env.REALTIME_INSTRUCTIONS ||
    "You are a helpful assistant. Always respond in Japanese. Do not switch languages.",
};
