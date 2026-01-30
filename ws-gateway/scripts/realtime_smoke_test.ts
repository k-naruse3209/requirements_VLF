import WebSocket from "ws";

type RealtimeEvent = {
  type?: string;
  [key: string]: unknown;
};

const env = process.env;
const apiKey = env.OPENAI_API_KEY || "";
const model = env.REALTIME_MODEL || "gpt-realtime";
const urlBase = env.REALTIME_URL || "wss://api.openai.com/v1/realtime";
const betaHeader = env.REALTIME_BETA_HEADER !== "0";
const schema = env.REALTIME_SCHEMA || "flat";
const runs = Number(env.RUNS || 10);
const audioMs = Number(env.AUDIO_MS || 600);
const silenceMs = Number(env.SILENCE_MS || 800);
const timeoutMs = Number(env.TIMEOUT_MS || 8000);
const appendChunks = Number(env.APPEND_CHUNKS || 5);
const appendGapMs = Number(env.APPEND_GAP_MS || 80);
const commitDelayMs = Number(env.COMMIT_DELAY_MS || 250);
const postCommitDelayMs = Number(env.POST_COMMIT_DELAY_MS || 120);
const clearBefore = env.CLEAR_BEFORE !== "0";
const waitForCommit = env.WAIT_FOR_COMMIT !== "0";
const audioKind = env.AUDIO_KIND || "noise";

if (!apiKey) {
  console.error("Missing OPENAI_API_KEY");
  process.exit(1);
}

const url = `${urlBase}?model=${encodeURIComponent(model)}`;
const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}` };
if (betaHeader) headers["OpenAI-Beta"] = "realtime=v1";

const toBase64 = (buffer: Buffer) => buffer.toString("base64");

const buildPcmuSilence = (ms: number) => {
  const bytes = Math.max(1, Math.floor((8000 * ms) / 1000));
  return Buffer.alloc(bytes, 0xff);
};

const buildPcm16Silence = (ms: number, sampleRate = 16000) => {
  const samples = Math.max(1, Math.floor((sampleRate * ms) / 1000));
  return Buffer.alloc(samples * 2, 0x00);
};

const buildPcm16Noise = (ms: number, sampleRate = 16000) => {
  const samples = Math.max(1, Math.floor((sampleRate * ms) / 1000));
  const buffer = Buffer.alloc(samples * 2);
  for (let i = 0; i < samples; i += 1) {
    const value = (Math.random() * 2000 - 1000) | 0;
    buffer.writeInt16LE(value, i * 2);
  }
  return buffer;
};

const useAudioSchema = schema === "audio";
const audioHz = Number(env.AUDIO_HZ || (useAudioSchema ? 24000 : 16000));

const makeSessionUpdate = () => {
  if (useAudioSchema) {
    return {
      type: "session.update",
      session: {
        type: "realtime",
        audio: {
          input: { format: { type: "audio/pcm", rate: audioHz } },
          output: { format: { type: "audio/pcm", rate: audioHz }, voice: "alloy" },
        },
        output_modalities: ["audio"],
      },
    };
  }
  return {
    type: "session.update",
    session: {
      input_audio_format: "pcm16",
      output_audio_format: "pcm16",
      voice: "alloy",
      modalities: ["audio", "text"],
      turn_detection: {
        type: "server_vad",
        silence_duration_ms: silenceMs,
        create_response: false,
      },
    },
  };
};

const makeResponseCreate = () => {
  if (useAudioSchema) {
    return {
      type: "response.create",
      response: {
        audio: { output: { format: { type: "audio/pcm", rate: audioHz }, voice: "alloy" } },
      },
    };
  }
  return {
    type: "response.create",
    response: {
      modalities: ["audio", "text"],
      output_audio_format: "pcm16",
      voice: "alloy",
    },
  };
};

const socket = new WebSocket(url, { headers });

let ready = false;
let sessionLogged = false;
let activeResponseId = "";
let audioBytes = 0;
let waiting: ((success: boolean) => void) | null = null;
let sessionReady = false;
let commitSeen = false;

const log = (label: string, payload: unknown) => {
  console.log(`[smoke] ${label}`, payload);
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

const awaitResponse = () =>
  new Promise<boolean>((resolve) => {
    waiting = resolve;
    setTimeout(() => {
      if (waiting) {
        waiting(false);
        waiting = null;
      }
    }, timeoutMs);
  });

const send = (payload: object) => {
  socket.send(JSON.stringify(payload));
};

socket.on("open", () => {
  log("connected", { url, model, schema, betaHeader });
  send(makeSessionUpdate());
  ready = true;
});

socket.on("message", (data) => {
  const text = data.toString();
  let payload: RealtimeEvent | null = null;
  try {
    payload = JSON.parse(text);
  } catch {
    return;
  }
  if (!payload) return;

  if (payload.type === "session.created" && !sessionLogged) {
    sessionLogged = true;
    log("session.created", payload);
  }

  if (payload.type === "session.updated") {
    sessionReady = true;
    log("session.updated", payload);
  }

  if (payload.type === "input_audio_buffer.committed") {
    commitSeen = true;
  }

  if (payload.type === "error") {
    log("error", payload);
  }

  if (payload.type === "response.created") {
    const responseId = (payload as { response?: { id?: string }; response_id?: string })
      .response?.id;
    activeResponseId = responseId || (payload as { response_id?: string }).response_id || "";
    audioBytes = 0;
  }

  if (payload.type === "response.output_audio.delta" || payload.type === "response.audio.delta") {
    const delta = payload.delta as string | undefined;
    if (delta) audioBytes += Buffer.from(delta, "base64").length;
  }

  if (payload.type === "response.done") {
    const responseId =
      (payload as { response?: { id?: string } }).response?.id ||
      (payload as { response_id?: string }).response_id ||
      "";
    if (!activeResponseId || responseId === activeResponseId) {
      const ok = audioBytes > 0;
      log("response.done", { audioBytes, ok });
      if (waiting) {
        waiting(ok);
        waiting = null;
      }
      activeResponseId = "";
    }
  }
});

socket.on("close", () => {
  log("closed", {});
  process.exit(1);
});

socket.on("error", (err) => {
  log("socket_error", err);
  process.exit(1);
});

const splitIntoChunks = (buffer: Buffer, chunkMs = 20) => {
  const bytesPerSample = 2;
  const bytesPerMs = Math.floor((audioHz * bytesPerSample) / 1000);
  const chunkSize = Math.max(1, bytesPerMs * chunkMs);
  const chunks: Buffer[] = [];
  for (let offset = 0; offset < buffer.length; offset += chunkSize) {
    chunks.push(buffer.subarray(offset, offset + chunkSize));
  }
  return chunks;
};

const run = async () => {
  while (!ready) {
    await new Promise((r) => setTimeout(r, 50));
  }
  const sessionDeadline = Date.now() + 3000;
  while (!sessionReady && Date.now() < sessionDeadline) {
    await new Promise((r) => setTimeout(r, 50));
  }

  for (let i = 1; i <= runs; i += 1) {
    const audioBuffer =
      audioKind === "silence"
        ? buildPcm16Silence(audioMs, audioHz)
        : buildPcm16Noise(audioMs, audioHz);
    const chunks = splitIntoChunks(audioBuffer);
    log("run.start", { i, audioMs });
    if (clearBefore) {
      send({ type: "input_audio_buffer.clear" });
    }
    commitSeen = false;
    for (let c = 0; c < appendChunks; c += 1) {
      for (const chunk of chunks) {
        send({ type: "input_audio_buffer.append", audio: toBase64(chunk) });
        await sleep(20);
      }
      if (appendGapMs > 0) {
        await sleep(appendGapMs);
      }
    }
    if (commitDelayMs > 0) {
      await sleep(commitDelayMs);
    }
    send({ type: "input_audio_buffer.commit" });
    if (waitForCommit) {
      const commitDeadline = Date.now() + 1000;
      while (!commitSeen && Date.now() < commitDeadline) {
        await sleep(20);
      }
    }
    if (postCommitDelayMs > 0) {
      await sleep(postCommitDelayMs);
    }
    send(makeResponseCreate());
    const ok = await awaitResponse();
    if (!ok) {
      console.error(`[smoke] run ${i} failed (no audio delta)`);
      process.exit(1);
    }
    log("run.ok", { i });
  }

  log("success", { runs });
  process.exit(0);
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
