import { request } from "node:http";
const req = request({ socketPath: process.env.VPN_CONTROL_SOCKET ?? "/run/firewall-vpn/control.sock", path: "/health", method: "POST", timeout: 3000 }, res => {
  res.resume(); res.once("end", () => process.exit(res.statusCode === 200 ? 0 : 1));
});
req.once("error", () => process.exit(1)); req.once("timeout", () => { req.destroy(); process.exit(1); }); req.end("{}");
