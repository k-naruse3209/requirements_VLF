const logEl = document.getElementById("log");
const btnInit = document.getElementById("btn-init");
const btnCall = document.getElementById("btn-call");
const btnHangup = document.getElementById("btn-hangup");
const callSidEl = document.getElementById("call-sid");
const remoteAudioBox = document.getElementById("remote-audio");

let device;
let activeCall;
let manualHangup = false;
let activeRemoteAudio;

const log = (message) => {
  logEl.textContent += `${message}\n`;
};

const logEvent = (event, details) => {
  const payload = { event, ts: Date.now(), ...details };
  log(JSON.stringify(payload));
};

const setCallSid = (sid) => {
  callSidEl.textContent = sid || "-";
};

const formatError = (err) => {
  if (!err) return "unknown error";
  const details = {
    name: err.name,
    code: err.code,
    message: err.message,
    description: err.description,
    explanation: err.explanation,
    originalError: err.originalError,
    causes: err.causes,
    solutions: err.solutions,
    info: err.info,
  };
  return JSON.stringify(details);
};

const getCallSid = (call) =>
  call?.parameters?.CallSid || call?.sid || call?._callSid || "";

const postCallStatus = async (callSid, event) => {
  if (!callSid) return;
  try {
    await fetch("/call-status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callSid, event, manualHangup, ts: Date.now() }),
    });
  } catch (err) {
    log(`Call status post failed: ${err.message}`);
  }
};

const postClientEvent = async (callSid, event) => {
  if (!callSid) return;
  try {
    await fetch("/client-event", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ callSid, event, manualHangup, ts: Date.now() }),
    });
  } catch (err) {
    log(`Client event post failed: ${err.message}`);
  }
};

const playRemoteAudioWithRetry = (audioEl, attempt = 1) => {
  if (!audioEl || typeof audioEl.play !== "function") return;
  const playPromise = audioEl.play();
  if (!playPromise || typeof playPromise.catch !== "function") return;
  playPromise.catch((err) => {
    if (attempt < 6) {
      setTimeout(() => playRemoteAudioWithRetry(audioEl, attempt + 1), 120 * attempt);
      return;
    }
    log(`Remote audio play failed: ${err.message}`);
  });
};

const mountRemoteAudioElement = (audioEl) => {
  if (!audioEl) return;
  const sid = getCallSid(activeCall) || "unknown";
  const isNewElement = activeRemoteAudio !== audioEl;
  activeRemoteAudio = audioEl;
  audioEl.autoplay = true;
  audioEl.muted = false;
  audioEl.volume = 1;
  audioEl.controls = true;
  audioEl.playsInline = true;
  if (remoteAudioBox && (isNewElement || !remoteAudioBox.contains(audioEl))) {
    remoteAudioBox.innerHTML = "";
    remoteAudioBox.appendChild(audioEl);
  }
  if (!audioEl.__vlfEventsBound) {
    audioEl.__vlfEventsBound = true;
    audioEl.addEventListener("playing", () => {
      logEvent("call.audio.playing", { callSid: sid });
    });
    audioEl.addEventListener("pause", () => {
      logEvent("call.audio.pause", { callSid: sid });
    });
    audioEl.addEventListener("ended", () => {
      logEvent("call.audio.ended", { callSid: sid });
    });
    audioEl.addEventListener("canplay", () => {
      playRemoteAudioWithRetry(audioEl);
    });
  }
  playRemoteAudioWithRetry(audioEl);
};

const fetchToken = async () => {
  const res = await fetch("/token");
  if (!res.ok) throw new Error("Failed to fetch token");
  const data = await res.json();
  return data.token;
};

const attachCallEvents = (call) => {
  const initialSid = getCallSid(call);
  if (initialSid) setCallSid(initialSid);
  call.on("accept", () => {
    const sid = getCallSid(call);
    if (sid) setCallSid(sid);
    manualHangup = false;
    logEvent("call.accept", { callSid: sid || "unknown", manualHangup });
    postClientEvent(sid, "accept");
  });
  call.on("disconnect", () => {
    const sid = getCallSid(call);
    logEvent("call.disconnect", { callSid: sid || "unknown", manualHangup });
    postCallStatus(sid, "disconnect");
    postClientEvent(sid, "disconnect");
  });
  call.on("cancel", () => {
    const sid = getCallSid(call);
    logEvent("call.cancel", { callSid: sid || "unknown", manualHangup });
    postCallStatus(sid, "cancel");
    postClientEvent(sid, "cancel");
  });
  call.on("reject", () => {
    const sid = getCallSid(call);
    logEvent("call.reject", { callSid: sid || "unknown", manualHangup });
    postCallStatus(sid, "reject");
    postClientEvent(sid, "reject");
  });
  call.on("error", (err) => {
    const sid = getCallSid(call);
    logEvent("call.error", { callSid: sid || "unknown", manualHangup, error: formatError(err) });
    postCallStatus(sid, "error");
    postClientEvent(sid, "error");
  });
  call.on("warning", (name) => {
    const sid = getCallSid(call);
    logEvent("call.warning", { callSid: sid || "unknown", manualHangup, warning: name });
  });
  call.on("warning-cleared", (name) => {
    const sid = getCallSid(call);
    logEvent("call.warning-cleared", { callSid: sid || "unknown", manualHangup, warning: name });
  });
  call.on("audio", (audioEl) => {
    const sid = getCallSid(call);
    logEvent("call.audio", { callSid: sid || "unknown", sameElement: audioEl === activeRemoteAudio });
    mountRemoteAudioElement(audioEl);
  });
};

btnInit.addEventListener("click", async () => {
  try {
    const token = await fetchToken();
    device = new Twilio.Device(token, {
      codecPreferences: ["pcmu"],
      closeProtection: true,
    });

    device.on("ready", () => log("Device ready"));
    device.on("error", (err, call) => {
      const sid = getCallSid(call);
      if (sid) setCallSid(sid);
      log(`Device error (CallSid=${sid || "unknown"}): ${formatError(err)}`);
      postCallStatus(sid, "device_error");
    });
    device.on("connect", () => log("Device connect"));
    device.on("disconnect", () => log("Device disconnect"));
    device.on("incoming", (call) => {
      log("Incoming call");
      activeCall = call;
      attachCallEvents(call);
      call.accept();
    });

    log("Speaker device selection: browser default");

    await device.register();
    log("Device registered");
  } catch (err) {
    log(`Init error: ${err.message}`);
  }
});

btnCall.addEventListener("click", async () => {
  if (!device) return log("Device not initialized");
  try {
    manualHangup = false;
    activeCall = await device.connect({ params: { To: "voip-test" } });
    if (!activeCall || typeof activeCall.on !== "function") {
      log("Call not created");
      return;
    }
    attachCallEvents(activeCall);
    log("Calling...");
  } catch (err) {
    log(`Call error: ${err.message}`);
  }
});

btnHangup.addEventListener("click", () => {
  if (activeCall) {
    manualHangup = true;
    activeCall.disconnect();
    logEvent("call.hangup", { callSid: getCallSid(activeCall) || "unknown", manualHangup });
  }
});
