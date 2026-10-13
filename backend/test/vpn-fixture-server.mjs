// Disposable local protocol fixture. Never use this server with production credentials.
import { createServer } from "node:http";
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { networkInterfaces } from "node:os";
const root = "/run/vpn-state/fixture", run = (file, args) => execFileSync(file, args, { encoding: "utf8", stdio: ["pipe", "pipe", "ignore"] });
const quote = value => `"${value.replace(/\\/g,"\\\\").replace(/"/g,'\\"')}"`;
mkdirSync(root, { recursive: true, mode: 0o700 });
const host = "198.18.0.1";
const privateKey = run("wg", ["genkey"]).trim(), publicKey = execFileSync("wg", ["pubkey"], { input: privateKey, encoding: "utf8" }).trim();
const children = [], diagnostics = [];
const daemon = (file, args) => { const child = spawn(file, args, { stdio: ["ignore","pipe","pipe"] }); const inspect = chunk => { const text = String(chunk); for (const [code, pattern] of [["PPP_AUTH",/authentication failed/i],["PPP_OPTION",/unrecognized option/i],["PPP_DEVICE",/couldn.t open.*\/dev\/ppp/i],["L2TP_TIMEOUT",/Maximum retries|Unable to establish|Connection refused/i],["L2TP_CONTROL",/control|fifo/i],["L2TP_CONNECTED",/Connection established/i],["PPP_STARTED",/start_pppd|Using interface/i]]) if(pattern.test(text)) diagnostics.push(code); }; child.stderr.on("data", inspect); child.stdout.on("data", inspect); children.push(child); };
for (const ip of ["198.18.0.1/32", "192.168.77.1/32", "192.168.88.1/32"]) run("ip", ["addr", "add", ip, "dev", "lo"]);
const server = createServer(async (request, reply) => {
  try {
    if (request.url === "/keys") { reply.end(JSON.stringify({ publicKey })); return; }
    if (request.url === "/diagnostics") { const sockets=run("ss",["-lun"]); const processes=run("ps",["-eo","comm"]); reply.end(JSON.stringify({ diagnostics, children: children.map(child=>({alive:child.exitCode===null,exitCode:child.exitCode})),port1701:sockets.includes(":1701"),port500:sockets.includes(":500"),pppdAlive:processes.split("\n").some(name=>name.trim()==="pppd") })); return; }
    let body = ""; for await (const chunk of request) body += chunk; const input = JSON.parse(body || "{}");
    if (request.url === "/wg") {
      run("ip", ["link", "add", "fixturewg", "type", "wireguard"]);
      writeFileSync(`${root}/wg.conf`, `[Interface]\nPrivateKey = ${privateKey}\nListenPort = 51820\n[Peer]\nPublicKey = ${input.publicKey}\nAllowedIPs = 10.70.0.2/32\n`, { mode: 0o600 });
      run("wg", ["setconf", "fixturewg", `${root}/wg.conf`]); run("ip", ["addr", "add", "10.70.0.1/32", "dev", "fixturewg"]); run("ip", ["link", "set", "fixturewg", "up"]); run("ip", ["route", "add", "10.70.0.2/32", "dev", "fixturewg"]);
    } else if (request.url === "/wg-peer") {
      run("wg", ["set", "fixturewg", "peer", input.publicKey, "allowed-ips", "10.71.0.2/32"]);
      run("ip", ["route", "add", "10.71.0.2/32", "dev", "fixturewg"]);
    } else if (request.url === "/l2tp") {
      writeFileSync("/etc/strongswan.conf", "charon { install_routes = no\n plugins { include strongswan.d/charon/*.conf }\n}\ninclude strongswan.d/*.conf\n");
      writeFileSync(`${root}/ipsec.conf`, `config setup\nconn fixture\n keyexchange=ikev1\n authby=secret\n type=transport\n left=${host}\n leftprotoport=17/1701\n right=%any\n rightprotoport=17/%any\n ike=aes256-sha256-modp2048,aes128-sha1-modp2048!\n esp=aes256-sha256,aes128-sha1!\n auto=add\n`);
      writeFileSync("/etc/ipsec.secrets", `include ${root}/ipsec.secrets\n`);
      writeFileSync(`${root}/ipsec.secrets`, `%any : PSK ${quote(input.psk)}\n`, { mode: 0o600 });
      writeFileSync("/etc/ppp/chap-secrets", `${quote(input.username)} * ${quote(input.password)} *\n`, { mode: 0o600 });
      writeFileSync(`${root}/ppp.options`, "auth\nrequire-mschap-v2\nrefuse-pap\nrefuse-chap\nrefuse-mschap\nrefuse-eap\nname fixture\nnodefaultroute\nnoccp\nhide-password\nlogfd 2\nmtu 1400\nmru 1400\n");
      writeFileSync(`${root}/xl2tpd.conf`, `[global]\nport = 1701\nlisten-addr = ${host}\n[lns default]\nip range = 10.60.0.2-10.60.0.10\nlocal ip = 10.60.0.1\nrequire authentication = yes\nname = fixture\npppoptfile = ${root}/ppp.options\nlength bit = yes\n`);
      daemon("ipsec", ["start", "--nofork", "--conf", `${root}/ipsec.conf`]);
      daemon("xl2tpd", ["-D", "-c", `${root}/xl2tpd.conf`, "-C", `${root}/control`, "-p", `${root}/xl2tpd.pid`]);
      await new Promise(resolve => setTimeout(resolve, 1800));
    }
    reply.end(JSON.stringify({ ok: true }));
  } catch { reply.statusCode = 500; reply.end(JSON.stringify({ code: "FIXTURE_FAILED" })); }
});
server.listen(8055, "0.0.0.0");
process.once("SIGTERM", () => { for (const child of children) child.kill(); server.close(); process.exit(0); });
