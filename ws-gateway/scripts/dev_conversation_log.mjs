import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import readline from "node:readline";

const cwd = process.cwd();
const logDir = path.resolve(cwd, process.env.LOG_DIR || "logs");
const rawLogPath = process.env.RAW_LOG_PATH || path.join(logDir, "ws-gateway.raw.log");
const conversationLogPath =
  process.env.CONVERSATION_LOG_PATH || path.join(logDir, "conversation.log");

fs.mkdirSync(logDir, { recursive: true });

const rawLog = fs.createWriteStream(rawLogPath, { flags: "a" });
const conversationLog = fs.createWriteStream(conversationLogPath, { flags: "a" });

const sessionStart = `[${new Date().toISOString()}] session.start\n`;
rawLog.write(sessionStart);
conversationLog.write(sessionStart);

function logConversation(role, text) {
  const line = `[${new Date().toISOString()}] ${role}: ${text}\n`;
  conversationLog.write(line);
}

function parseJsonFromLine(line, marker) {
  const markerIndex = line.indexOf(marker);
  if (markerIndex < 0) return null;
  const jsonStart = line.indexOf("{", markerIndex);
  if (jsonStart < 0) return null;
  try {
    return JSON.parse(line.slice(jsonStart));
  } catch {
    return null;
  }
}

function handleExtract(line) {
  const userMarker = "[CONV] USER ";
  const userMarkerIndex = line.indexOf(userMarker);
  if (userMarkerIndex >= 0) {
    const raw = line.slice(userMarkerIndex + userMarker.length);
    try {
      const parsed = JSON.parse(raw);
      const text = parsed?.text;
      if (typeof text === "string" && text.trim()) {
        logConversation("USER", text.trim());
      }
    } catch {
      // noop
    }
    return;
  }

  const aiMarker = "[CONV] AI ";
  const aiMarkerIndex = line.indexOf(aiMarker);
  if (aiMarkerIndex >= 0) {
    const raw = line.slice(aiMarkerIndex + aiMarker.length);
    try {
      const parsed = JSON.parse(raw);
      const text = parsed?.text;
      if (typeof text === "string" && text.trim()) {
        logConversation("AI", text.trim());
      }
    } catch {
      // noop
    }
    return;
  }

  const transcription = parseJsonFromLine(line, "input_audio_transcription.completed ");
  if (transcription) {
    const transcript = transcription.transcript;
    if (typeof transcript === "string" && transcript.trim()) {
      logConversation("USER", transcript.trim());
    }
    return;
  }

}

function wireStream(stream, target) {
  const rl = readline.createInterface({ input: stream });
  rl.on("line", (line) => {
    target.write(`${line}\n`);
    rawLog.write(`${line}\n`);
    handleExtract(line);
  });
}

const child = spawn(process.execPath, ["--import", "tsx", "src/index.ts"], {
  cwd,
  env: process.env,
  stdio: ["inherit", "pipe", "pipe"],
});

if (!child.stdout || !child.stderr) {
  throw new Error("failed to attach to child process streams");
}

wireStream(child.stdout, process.stdout);
wireStream(child.stderr, process.stderr);

const forwardSignal = (signal) => {
  if (!child.killed) child.kill(signal);
};

process.on("SIGINT", () => forwardSignal("SIGINT"));
process.on("SIGTERM", () => forwardSignal("SIGTERM"));

child.on("exit", (code, signal) => {
  const sessionEnd = `[${new Date().toISOString()}] session.end code=${
    code ?? "null"
  } signal=${signal ?? "null"}\n`;
  rawLog.write(sessionEnd);
  conversationLog.write(sessionEnd);
  rawLog.end();
  conversationLog.end();
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 0);
});
