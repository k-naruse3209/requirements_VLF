import http from "node:http";
import httpProxy from "http-proxy";

const port = Number(process.env.PROXY_PORT || 4000);
const voipTarget = process.env.VOIP_TARGET || "http://127.0.0.1:3001";
const wsTarget = process.env.WS_TARGET || "ws://127.0.0.1:8080";

const proxy = httpProxy.createProxyServer({ changeOrigin: true, ws: true });

const isVoipPath = (url) => {
  return (
    url === "/" ||
    url.startsWith("/voice") ||
    url.startsWith("/twilio/stream-status") ||
    url.startsWith("/token") ||
    url.startsWith("/app.js") ||
    url.startsWith("/twilio.min.js") ||
    url.startsWith("/favicon.ico")
  );
};

const server = http.createServer((req, res) => {
  if (!req.url) return res.end();
  if (isVoipPath(req.url)) {
    return proxy.web(req, res, { target: voipTarget });
  }
  res.writeHead(404, { "Content-Type": "text/plain" });
  res.end("Not found");
});

server.on("upgrade", (req, socket, head) => {
  if (req.url && req.url.startsWith("/stream")) {
    return proxy.ws(req, socket, head, { target: wsTarget });
  }
  socket.destroy();
});

server.listen(port, () => {
  console.log(`Local proxy listening on :${port}`);
  console.log(`VOIP target: ${voipTarget}`);
  console.log(`WS target: ${wsTarget}`);
});
