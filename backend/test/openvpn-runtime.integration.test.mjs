import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp,rm,readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { VpnAgent } from '../dist/vpn/vpn-agent.js';
const endpoint=process.env.FIXTURE_ENDPOINT;
const ip=args=>JSON.parse(execFileSync('ip',['-j','-N','-4',...args],{encoding:'utf8'}));
for(const transport of ['udp','tcp','auth'])test(`real OpenVPN ${transport}: TLS, exact split route, no pushed route/DNS, recovery and manual stop`,async()=>{
 assert.ok(endpoint,'isolated fixture endpoint is required');
 for(let attempt=0;attempt<30;attempt++){try{if((await fetch(`http://${endpoint}:8055/ready`,{signal:AbortSignal.timeout(1000)})).ok)break;}catch{}if(attempt===29)throw new Error('Fixture readiness timeout');await new Promise(r=>setTimeout(r,300));}
 const root=await mkdtemp(join(tmpdir(),'ovpn-client-')),agent=new VpnAgent(root),defaults=JSON.stringify(ip(['route','show','default'])),dns=await readFile('/etc/resolv.conf','utf8');
 const response=await fetch(`http://${endpoint}:8055/${transport}`);assert.equal(response.status,200);const {profile,username,password}=await response.json();
 const config={protocol:'openvpn',openvpnProfile:profile,routes:['192.168.242.1/32'],...(username?{username,password}:{})};
 try{
  if(username){await assert.rejects(agent.connect('wrong-auth-fixture',{...config,password:'deliberately-incorrect'}),/VPN_OPENVPN_AUTH_FAILED/);assert.equal((await agent.status('wrong-auth-fixture')).state,'disconnected');}
  const clientCert=/<cert>\n([\s\S]+?)\n<\/cert>/.exec(profile)[1];
  await assert.rejects(agent.connect('wrong-ca-fixture',{...config,openvpnProfile:profile.replace(/<ca>[\s\S]+?<\/ca>/,`<ca>\n${clientCert}\n</ca>`)}),/VPN_OPENVPN_TLS_FAILED/);
  assert.equal((await agent.status('wrong-ca-fixture')).state,'disconnected');
  assert.equal((await agent.connect('openvpn-fixture',config)).state,'connected');
  assert.equal((await agent.test('openvpn-fixture','192.168.242.1',8055)).reachable,true);
  assert.equal(JSON.stringify(ip(['route','show','default'])),defaults);assert.equal(await readFile('/etc/resolv.conf','utf8'),dns);
  assert.equal(ip(['route','show','table','main']).some(r=>['192.168.243.0/24','10.250.250.0/24','0.0.0.0/1','128.0.0.0/1'].includes(r.dst)),false);
  const t=agent.tunnels.get('openvpn-fixture');for(const child of t.processes)child.kill('SIGKILL');await new Promise(r=>setTimeout(r,300));
  assert.equal((await agent.status('openvpn-fixture')).state,'error');
  assert.equal((await agent.recover('openvpn-fixture',config)).state,'connected');
  assert.equal((await agent.test('openvpn-fixture','192.168.242.1',8055)).reachable,true);
  await agent.disconnect('openvpn-fixture');assert.equal((await agent.status('openvpn-fixture')).state,'disconnected');
  assert.equal(ip(['route','show','table','main']).some(r=>String(r.protocol)==='186'),false);
  assert.equal(JSON.stringify(ip(['route','show','default'])),defaults);assert.equal(await readFile('/etc/resolv.conf','utf8'),dns);
 }finally{await agent.disconnect('openvpn-fixture');await rm(root,{recursive:true,force:true});}
});
