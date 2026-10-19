import { connect } from "node:net";
/** Private Unix socket only. Never forward management output to the API/log. */
export async function openVpnState(path: string) {
  return new Promise<{ connected: boolean; address?: string; rxBytes: number; txBytes: number }>((resolve, reject) => {
    const socket = connect({path}); let output = "", done = false, statsRequested = false;
    const fail = () => { if (done) return; done = true; socket.destroy(); reject(new Error("VPN_OPENVPN_MANAGEMENT_FAILED")); };
    socket.setTimeout(1500); socket.once("error", fail); socket.once("timeout", fail);
    const finish = () => {
      if (done) return; done = true;
      const states = output.split(/\r?\n/).filter(line => /^\d+,[A-Z]+,/.test(line));
      const last = states.at(-1)?.split(",");
      socket.destroy();resolve({ connected: last?.[1] === "CONNECTED" && last[2] === "SUCCESS", address: last?.[3], rxBytes: Number(/bytesin=(\d+)/.exec(output)?.[1] ?? 0), txBytes: Number(/bytesout=(\d+)/.exec(output)?.[1] ?? 0) });
    };
    socket.once("connect", () => socket.write("state\n"));
    socket.on("data", chunk => {
      output += chunk; if (output.length > 16384) return fail();
      if (!statsRequested && /(?:^|\n)END\r?\n/.test(output)) { statsRequested=true;socket.write("load-stats\n"); }
      if (statsRequested && /SUCCESS:.*bytesout=\d+/.test(output)) finish();
    });
    socket.once("close",finish);
  });
}
