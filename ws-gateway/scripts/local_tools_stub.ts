import http from "node:http";

const host = process.env.TOOLS_STUB_HOST || "127.0.0.1";
const port = Number(process.env.TOOLS_STUB_PORT || 19002);
const fixedPrice = Number(process.env.TOOLS_STUB_PRICE || 2680);
const fixedCurrency = process.env.TOOLS_STUB_CURRENCY || "JPY";
const fixedDeliveryDate = process.env.TOOLS_STUB_DELIVERY_DATE || "2026-02-20";

type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };

const log = (message: string, data?: unknown) => {
  if (data == null) {
    console.log(`[tools-stub] ${message}`);
    return;
  }
  console.log(`[tools-stub] ${message}`, data);
};

const readBody = async (req: http.IncomingMessage) =>
  new Promise<string>((resolve, reject) => {
    let body = "";
    req.on("data", (chunk) => {
      body += chunk.toString();
      if (body.length > 1024 * 1024) {
        reject(new Error("payload too large"));
      }
    });
    req.on("end", () => resolve(body));
    req.on("error", reject);
  });

const sendJson = (res: http.ServerResponse, status: number, payload: JsonValue) => {
  res.writeHead(status, { "content-type": "application/json" });
  res.end(JSON.stringify(payload));
};

const server = http.createServer(async (req, res) => {
  if (req.method === "GET" && req.url === "/healthz") {
    sendJson(res, 200, { ok: true });
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 404, { error: "not_found" });
    return;
  }

  const bodyRaw = await readBody(req).catch(() => "");
  let body: Record<string, unknown> = {};
  if (bodyRaw) {
    try {
      body = JSON.parse(bodyRaw) as Record<string, unknown>;
    } catch {
      sendJson(res, 400, { error: "invalid_json" });
      return;
    }
  }

  if (req.url === "/tools/stock") {
    log("stock", body);
    sendJson(res, 200, { available: true, quantity: 99 });
    return;
  }
  if (req.url === "/tools/price") {
    log("price", body);
    sendJson(res, 200, { price: fixedPrice, currency: fixedCurrency });
    return;
  }
  if (req.url === "/tools/delivery-date") {
    log("delivery-date", body);
    sendJson(res, 200, { deliveryDate: fixedDeliveryDate, estimatedDays: 3 });
    return;
  }
  if (req.url === "/tools/orders") {
    log("orders", body);
    sendJson(res, 200, {
      orderId: `ORD-STUB-${Date.now()}`,
      status: "confirmed",
    });
    return;
  }

  sendJson(res, 404, { error: "not_found" });
});

server.listen(port, host, () => {
  log("listening", { host, port });
});
