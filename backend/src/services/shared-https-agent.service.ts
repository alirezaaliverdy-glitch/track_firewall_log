import https from "node:https";

// HTTPS is request/response based. Reuse idle TLS sockets without presenting
// them as permanent authenticated vendor sessions.
const options: https.AgentOptions = {
  keepAlive: true,
  keepAliveMsecs: 15_000,
  maxSockets: 2,
  maxFreeSockets: 1,
  maxTotalSockets: 128,
  scheduling: "lifo",
  timeout: 60_000
};

const verified = new https.Agent(options);
const legacyUnverified = new https.Agent(options);

export function vendorHttpsAgent(verifyCertificate: boolean) {
  return verifyCertificate ? verified : legacyUnverified;
}
