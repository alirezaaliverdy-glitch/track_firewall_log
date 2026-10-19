import assert from "node:assert/strict";
import { test } from "node:test";
import { createServer } from "node:net";
import { mkdtemp,rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseOpenVpnProfile,openVpnConfig } from "../src/vpn/openvpn-profile.js";
import { validateVpn } from "../src/vpn/vpn-validation.js";
import { openVpnState } from "../src/vpn/openvpn-management.js";
import { VpnRecoverySchedule } from "../src/vpn/vpn-recovery.js";
// Deliberately non-functional synthetic PEM; real TLS certificates are generated in runtime fixture.
const profile=`client\ndev tun\nproto udp\nremote vpn.example.test 1194\nauth-user-pass\n<ca>\n-----BEGIN CERTIFICATE-----\nZmFrZQ==\n-----END CERTIFICATE-----\n</ca>\n`;
test("OpenVPN import allowlists data, regenerates split-only config and preserves TLS verification",()=>{
 const p=parseOpenVpnProfile(`${profile}redirect-gateway def1\ndhcp-option DNS 8.8.8.8\nroute 0.0.0.0 0.0.0.0\nroute-ipv6 ::/0\n`);
 const config=openVpnConfig(p,"198.51.100.12","fv0123456789","/run/vpn-state/fv0123456789",false);
 for(const expected of ["route-noexec","route-nopull","ifconfig-noexec","script-security 1","remote-cert-tls server","tls-version-min 1.2","allow-compression no"])assert.ok(config.includes(expected));
 assert.ok(!config.includes("8.8.8.8"));assert.ok(!config.includes("0.0.0.0"));assert.ok(!config.includes("::/0"));
 const validated=validateVpn({protocol:"openvpn",openvpnProfile:profile,routes:["192.168.20.0/24"],username:"fixture",password:"synthetic-password"});
 assert.equal(validated.endpoint,"vpn.example.test");assert.equal(validated.endpointPort,1194);
 assert.equal(parseOpenVpnProfile(profile.replace("proto udp","proto tcp-client")).transport,"tcp4-client");
 assert.match(openVpnConfig(parseOpenVpnProfile(`${profile}tls-version-min 1.3\n`),"198.51.100.12","fv0123456789","/run/vpn-state/fv0123456789",false),/tls-version-min 1.3/);
});
test("OpenVPN cannot import executables, external files, injected PEM, TAP, weak crypto or arbitrary server alternatives",()=>{
 for(const option of ["up /bin/sh","plugin /tmp/plugin.so","config /etc/passwd","management /tmp/evil unix","auth-user-pass /etc/passwd","ca /etc/passwd","setenv opt up /bin/sh","script-security 3","remote second.test 443","cipher BF-CBC","compress lz4","tls-version-min 1.0"]){assert.throws(()=>parseOpenVpnProfile(`${profile}${option}\n`));}
 assert.throws(()=>parseOpenVpnProfile(profile.replace("dev tun","dev tap")));
 assert.throws(()=>parseOpenVpnProfile(profile.replace("ZmFrZQ==","ZmFrZQ==\n</ca>\nup /bin/sh\n<ca>")));
 assert.throws(()=>parseOpenVpnProfile("x".repeat(131073)));
 assert.throws(()=>validateVpn({protocol:"openvpn",openvpnProfile:profile,routes:["0.0.0.0/0"],username:"fixture",password:"synthetic-password"}));
 assert.throws(()=>validateVpn({protocol:"openvpn",openvpnProfile:profile.replace("vpn.example.test","127.0.0.1"),routes:["192.168.20.0/24"],username:"fixture",password:"synthetic-password"}));
});
test("OpenVPN authentication failure pauses retries without discarding requested connection intent",()=>{
 const schedule=new VpnRecoverySchedule();schedule.failed("fixture","VPN_OPENVPN_AUTH_FAILED",1000);assert.equal(schedule.due("fixture",1e9),false);assert.equal(schedule.info("fixture").recoveryBlocked,true);schedule.clear("fixture");assert.equal(schedule.due("fixture",1001),true);
});
test("private OpenVPN management state requires actual CONNECTED success and parses bounded counters",async()=>{
 const dir=await mkdtemp(join(tmpdir(),"ovpn-management-")),path=join(dir,"socket");let reconnect=false;
 const server=createServer(socket=>socket.on("data",chunk=>{if(String(chunk).includes("state"))socket.write(`>INFO:fixture\n1,CONNECTED,SUCCESS,10.250.0.2,198.51.100.12,1194\n${reconnect?"2,RECONNECTING,ping-restart,,,,\n":""}END\n`);else socket.end("SUCCESS: nclients=1,bytesin=1234,bytesout=5678\n");}));
 await new Promise<void>(resolve=>server.listen(path,resolve));
 try{const state=await openVpnState(path);assert.equal(state.connected,true);assert.equal(state.address,"10.250.0.2");assert.equal(state.rxBytes,1234);assert.equal(state.txBytes,5678);reconnect=true;assert.equal((await openVpnState(path)).connected,false);}finally{await new Promise<void>(resolve=>server.close(()=>resolve()));await rm(dir,{recursive:true,force:true});}
});
