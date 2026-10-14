// Runs through node stdin inside the API container. Connect locally while
// retaining the public TLS name, Host routing and certificate verification.
const https = require("node:https");

function request(path) {
  return new Promise((resolve, reject) => {
    const req = https.get({ hostname: "gateway", servername: "eosnet.ir", headers: { Host: "eosnet.ir" }, path, rejectUnauthorized: true }, response => {
      let body = "";
      response.setEncoding("utf8");
      response.on("data", chunk => {
        body += chunk;
        if (body.length > 131072) req.destroy(new Error("oversized_gateway_response"));
      });
      response.on("error", reject);
      response.on("end", () => resolve({ status: response.statusCode, body }));
    });
    req.setTimeout(15000, () => req.destroy(new Error("gateway_timeout")));
    req.on("error", reject);
  });
}

(async () => {
  const ready = await request("/firewall-api/health/ready");
  if (ready.status !== 200 || JSON.parse(ready.body).ready !== true) throw new Error("api_not_ready");
  const dashboard = await request("/dashboard");
  if (dashboard.status !== 200 || !/<html[\s>]/i.test(dashboard.body)) throw new Error("dashboard_unavailable");
  process.stdout.write("api_ready=true dashboard=reachable gateway_tls=verified\n");
})().catch(() => {
  // Never echo API bodies or transport errors that could contain server data.
  process.stderr.write("Production gateway TLS/readiness/dashboard verification failed\n");
  process.exitCode = 1;
});
