const logEl = document.getElementById("log");
const btnInit = document.getElementById("btn-init");
const btnCall = document.getElementById("btn-call");
const btnHangup = document.getElementById("btn-hangup");
const callSidEl = document.getElementById("call-sid");

let device;
let activeCall;

const log = (message) => {
  logEl.textContent += `${message}\n`;
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
      body: JSON.stringify({ callSid, event }),
    });
  } catch (err) {
    log(`Call status post failed: ${err.message}`);
  }
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
    log(`Call accepted (CallSid=${sid || "unknown"})`);
  });
  call.on("disconnect", () => {
    const sid = getCallSid(call);
    log(`Call disconnected (CallSid=${sid || "unknown"})`);
    postCallStatus(sid, "disconnect");
  });
  call.on("cancel", () => {
    const sid = getCallSid(call);
    log(`Call canceled (CallSid=${sid || "unknown"})`);
    postCallStatus(sid, "cancel");
  });
  call.on("reject", () => {
    const sid = getCallSid(call);
    log(`Call rejected (CallSid=${sid || "unknown"})`);
    postCallStatus(sid, "reject");
  });
  call.on("error", (err) => {
    const sid = getCallSid(call);
    log(`Call error (CallSid=${sid || "unknown"}): ${formatError(err)}`);
    postCallStatus(sid, "error");
  });
  call.on("warning", (name) => {
    const sid = getCallSid(call);
    log(`Call warning (CallSid=${sid || "unknown"}): ${name}`);
  });
  call.on("warning-cleared", (name) => {
    const sid = getCallSid(call);
    log(`Call warning-cleared (CallSid=${sid || "unknown"}): ${name}`);
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

    await device.register();
    log("Device registered");
  } catch (err) {
    log(`Init error: ${err.message}`);
  }
});

btnCall.addEventListener("click", async () => {
  if (!device) return log("Device not initialized");
  try {
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
    activeCall.disconnect();
    log("Call ended");
  }
});
