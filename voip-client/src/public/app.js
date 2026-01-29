const logEl = document.getElementById("log");
const btnInit = document.getElementById("btn-init");
const btnCall = document.getElementById("btn-call");
const btnHangup = document.getElementById("btn-hangup");

let device;
let activeCall;

const log = (message) => {
  logEl.textContent += `${message}\n`;
};

const fetchToken = async () => {
  const res = await fetch("/token");
  if (!res.ok) throw new Error("Failed to fetch token");
  const data = await res.json();
  return data.token;
};

const attachCallEvents = (call) => {
  call.on("accept", () => log("Call accepted"));
  call.on("disconnect", () => log("Call disconnected"));
  call.on("cancel", () => log("Call canceled"));
  call.on("reject", () => log("Call rejected"));
  call.on("error", (err) => log(`Call error: ${err.message}`));
};

btnInit.addEventListener("click", async () => {
  try {
    const token = await fetchToken();
    device = new Twilio.Device(token, {
      codecPreferences: ["pcmu"],
      closeProtection: true,
    });

    device.on("ready", () => log("Device ready"));
    device.on("error", (err) => log(`Device error: ${err.message}`));
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
