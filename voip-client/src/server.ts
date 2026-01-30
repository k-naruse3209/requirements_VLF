import http from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import dotenv from "dotenv";
import twilio from "twilio";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const publicDir = join(__dirname, "public");

const accountSid = process.env.ACCOUNT_SID || "";
const apiKeySid = process.env.API_KEY_SID || "";
const apiKeySecret = process.env.API_KEY_SECRET || "";
const appSid = process.env.APP_SID || "";
const clientId = process.env.CLIENT_ID || "browser";
const port = Number(process.env.PORT || 3001);
const streamUrl = process.env.STREAM_URL || "";
const streamStatusUrl = process.env.STREAM_STATUS_URL || "";
const streamMode = process.env.STREAM_MODE || "connect";

const send = (res: http.ServerResponse, status: number, body: string, type = "text/plain") => {
  res.writeHead(status, { "Content-Type": type });
  res.end(body);
};

const missingEnv = () => !accountSid || !apiKeySid || !apiKeySecret || !appSid;

const readBody = async (req: http.IncomingMessage) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk));
  }
  return Buffer.concat(chunks).toString("utf8");
};

const parseFormBody = (body: string) => {
  const params = new URLSearchParams(body);
  const result: Record<string, string> = {};
  for (const [key, value] of params.entries()) {
    result[key] = value;
  }
  return result;
};

const twilioClient = accountSid && apiKeySid && apiKeySecret
  ? twilio(apiKeySid, apiKeySecret, { accountSid })
  : null;

const server = http.createServer(async (req, res) => {
  if (!req.url) return send(res, 400, "Bad request");
  console.log(`Request: ${req.method} ${req.url}`);
  if (req.url === "/" && req.method === "GET") {
    const html = await readFile(join(publicDir, "index.html"), "utf8");
    return send(res, 200, html, "text/html; charset=utf-8");
  }
  if (req.url === "/app.js" && req.method === "GET") {
    const js = await readFile(join(publicDir, "app.js"), "utf8");
    return send(res, 200, js, "text/javascript; charset=utf-8");
  }
  if (req.url === "/twilio.min.js" && req.method === "GET") {
    const sdkPath = join(__dirname, "..", "node_modules", "@twilio", "voice-sdk", "dist", "twilio.min.js");
    const sdk = await readFile(sdkPath, "utf8");
    return send(res, 200, sdk, "text/javascript; charset=utf-8");
  }
  if (req.url === "/token" && req.method === "GET") {
    if (missingEnv()) {
      return send(res, 500, "Missing Twilio env vars");
    }
    try {
      const AccessToken = twilio.jwt.AccessToken;
      const VoiceGrant = AccessToken.VoiceGrant;
      const token = new AccessToken(accountSid, apiKeySid, apiKeySecret, {
        identity: clientId,
        ttl: 3600,
      });
      const voiceGrant = new VoiceGrant({
        outgoingApplicationSid: appSid,
        incomingAllow: true,
      });
      token.addGrant(voiceGrant);
      return send(res, 200, JSON.stringify({ token: token.toJwt() }), "application/json");
    } catch (err) {
      console.error("Token generation failed", err);
      return send(res, 500, "Token generation failed");
    }
  }
  if (req.url.startsWith("/voice") && req.method === "POST") {
    if (!streamUrl) {
      return send(res, 500, "Missing STREAM_URL");
    }
    const url = new URL(req.url, `http://localhost:${port}`);
    const mode = url.searchParams.get("mode") || streamMode;
    const statusCallback = streamStatusUrl || "";
    const streamParams = `
    <Parameter name="client_id" value="${clientId}" />
    <Parameter name="stream_mode" value="${mode}" />`;
    const streamTag = statusCallback
      ? `<Stream url="${streamUrl}" statusCallback="${statusCallback}" statusCallbackMethod="POST">${streamParams}
    </Stream>`
      : `<Stream url="${streamUrl}">${streamParams}
    </Stream>`;
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  ${mode === "start"
    ? `<Start>
    ${streamTag}
  </Start>`
    : `<Connect>
    ${streamTag}
  </Connect>`}
  <Say language="ja-JP">テスト通話を開始します。</Say>
  <Pause length="60" />
</Response>`;
    return send(res, 200, twiml, "text/xml; charset=utf-8");
  }
  if (req.url === "/twilio/stream-status" && req.method === "POST") {
    const raw = await readBody(req);
    const data = parseFormBody(raw);
    console.log("Stream status callback", data);
    return send(res, 204, "");
  }
  if (req.url === "/call-status" && req.method === "POST") {
    if (!twilioClient) {
      return send(res, 500, "Missing Twilio env vars");
    }
    const raw = await readBody(req);
    let payload: { callSid?: string; event?: string } = {};
    try {
      payload = JSON.parse(raw);
    } catch {
      return send(res, 400, "Invalid JSON");
    }
    if (!payload.callSid) return send(res, 400, "Missing callSid");
    try {
      const call = await twilioClient.calls(payload.callSid).fetch();
      console.log("Call status fetch", {
        event: payload.event,
        callSid: payload.callSid,
        status: call.status,
        errorCode: call.errorCode,
        direction: call.direction,
        from: call.from,
        to: call.to,
      });
      return send(res, 200, JSON.stringify({ ok: true }), "application/json");
    } catch (err) {
      console.error("Call status fetch failed", err);
      return send(res, 500, "Call status fetch failed");
    }
  }
  if (req.url === "/favicon.ico" && req.method === "GET") {
    return send(res, 204, "");
  }
  send(res, 404, "Not found");
});

server.listen(port, () => {
  console.log(`VoIP test server listening on :${port}`);
});
