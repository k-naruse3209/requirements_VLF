export const config = {
  port: Number(process.env.WS_PORT || 8080),
  realtimeUrl: process.env.REALTIME_URL || "wss://api.openai.com/v1/realtime",
  realtimeModel: process.env.REALTIME_MODEL || "gpt-4o-realtime-preview",
  openaiApiKey: process.env.OPENAI_API_KEY || "",
};
