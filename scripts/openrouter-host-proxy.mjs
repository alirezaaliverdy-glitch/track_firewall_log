import http from "node:http";
import net from "node:net";
import { timingSafeEqual } from "node:crypto";

const host = process.env.OPENROUTER_PROXY_HOST || "127.0.0.1";
const port = Number.parseInt(process.env.OPENROUTER_PROXY_PORT || "8787", 10);
const token = process.env.OPENROUTER_PROXY_TOKEN || "";
const allowedTarget = "openrouter.ai:443";

if (token.length < 32) {
  throw new Error("OPENROUTER_PROXY_TOKEN must contain at least 32 characters");
}

function isPrivateAddress(address = "") {
  const normalized = address.replace(/^::ffff:/, "");
  return normalized === "::1" || normalized === "127.0.0.1" || normalized.startsWith("10.") ||
    normalized.startsWith("192.168.") || /^172\.(1[6-9]|2\d|3[01])\./.test(normalized);
}

const server = http.createServer((_request, response) => {
  response.writeHead(405, { "Content-Type": "text/plain" });
  response.end("CONNECT only\n");
});

function hasValidAuthorization(header) {
  if (typeof header !== "string") return false;
  const expected = Buffer.from(`Basic ${Buffer.from(`firewall:${token}`).toString("base64")}`);
  const actual = Buffer.from(header);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}

server.on("connect", (request, clientSocket, head) => {
  if (!isPrivateAddress(request.socket.remoteAddress) || request.url !== allowedTarget || !hasValidAuthorization(request.headers["proxy-authorization"])) {
    clientSocket.end("HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n");
    return;
  }

  const upstream = net.connect(443, "openrouter.ai", () => {
    clientSocket.write("HTTP/1.1 200 Connection Established\r\n\r\n");
    if (head.length > 0) upstream.write(head);
    upstream.pipe(clientSocket);
    clientSocket.pipe(upstream);
  });
  upstream.once("error", () => clientSocket.destroy());
  clientSocket.once("error", () => upstream.destroy());
});

server.listen(port, host, () => {
  console.log(`OpenRouter host proxy listening on ${host}:${port}`);
});
