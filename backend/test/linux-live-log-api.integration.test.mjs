import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes,randomUUID,generateKeyPairSync} from 'node:crypto';
import {createServer} from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import ssh2 from 'ssh2';

test('actual SSH live source uses catalog/preview/one-confirmation/PolicyGuard/audit and scoped realtime HTTP delivery',async()=>{
 process.env.CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('hex');process.env.AUTH_SESSION_SECRET=randomBytes(32).toString('hex');
 process.env.PRODUCT_MODE='persian_command_catalog';process.env.ACTION_EXECUTION_MODE='quick_controlled';process.env.ACTION_ALLOW_LAB_UNRESTRICTED_MANAGEMENT='true';
 const dir=await mkdtemp(join(tmpdir(),'live-log-api-'));process.env.VPN_CONTROL_SOCKET=join(dir,'vpn.sock');
 const vpn=createServer((_req,res)=>res.end(JSON.stringify({throughTunnel:false})));await new Promise(resolve=>vpn.listen(process.env.VPN_CONTROL_SOCKET,resolve));
 const {prisma,shutdownDatabase}=await import('../dist/db/prisma.js'),{buildApp}=await import('../dist/app.js'),{createSession}=await import('../dist/services/auth.service.js'),{encryptSecret}=await import('../dist/services/credential-crypto.service.js');
 const clients=new Set(),streams=new Set(),seen=[],password=randomBytes(18).toString('hex'),key=generateKeyPairSync('rsa',{modulusLength:2048}).privateKey.export({type:'pkcs1',format:'pem'});let commands=0,follow=0,probeFails=false,missingWebFile=false;
 const ssh=new ssh2.Server({hostKeys:[key]},client=>{clients.add(client);client.on('error',()=>{});client.on('close',()=>clients.delete(client));client.on('authentication',ctx=>ctx.method==='password'&&ctx.password===password?ctx.accept():ctx.reject());
  client.on('ready',()=>client.on('session',accept=>{const session=accept();session.on('exec',(accept,_reject,info)=>{commands++;seen.push(info.command);const ch=accept();
   if(/^id -u; if sudo -n true 2>\/dev\/null; then printf /.test(info.command)){ch.write('0\n');ch.exit(0);ch.end();}
   else if(/^timeout 1800 (journalctl|docker logs) /.test(info.command)){follow++;streams.add(ch);ch.on('close',()=>streams.delete(ch));ch.on('signal',()=>{ch.exit(0);ch.end();});}
   else if(info.command.startsWith('docker ps --format')){ch.write(JSON.stringify({ID:'abcdef123456',Image:'nginx:1.27',Ports:'0.0.0.0:80->80/tcp'})+'\n');ch.exit(0);ch.end();}
   else if(info.command.startsWith('command -v timeout')){ch.exit(probeFails?1:missingWebFile&&info.command.includes('readlink -f')?49:0);ch.end();}
   else{ch.exit(1);ch.end();}
  });}));
 });await new Promise(resolve=>ssh.listen(0,'127.0.0.1',resolve));const port=ssh.address().port;
 const http=createServer((req,res)=>{for(const ch of streams)ch.write(JSON.stringify({MESSAGE:`fixture GET ${req.url} from 192.0.2.10 password=fixture-sensitive-value`,_SYSTEMD_UNIT:'fixture-api.service',PRIORITY:'6',__REALTIME_TIMESTAMP:String(Date.now()*1000)})+'\n');res.end('ok');});await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
 const app=await buildApp(),tag=`live-${randomUUID()}`,users=[];let deviceId,credentialId,planIds=[];
 async function identity(role,ownerId,grants=['page:actions.center']){const u=await prisma.appUser.create({data:{username:`${tag}-${users.length}`,displayName:'Fixture',passwordHash:'not-a-login',role,workspaceOwnerId:ownerId,allowedSections:grants}});users.push(u.id);const {token}=await createSession(u.id,{}),headers={cookie:`firewall_session=${token}`};headers['x-csrf-token']=(await app.inject({url:'/api/auth/csrf',headers})).json().csrfToken;return {u,headers};}
 const send=(who,method,url,payload)=>app.inject({method,url,headers:who.headers,...(payload===undefined?{}:{payload})});
 try{
  const admin=await identity('admin'),operator=await identity('operator',admin.u.id),viewer=await identity('viewer',admin.u.id),denied=await identity('operator',admin.u.id,[]),foreign=await identity('admin');
  const company=await prisma.company.create({data:{ownerId:admin.u.id,code:tag,name:tag}}),credential=await prisma.deviceCredential.create({data:{name:tag,type:'password',username:'fixture',secretEncrypted:encryptSecret(password)}});credentialId=credential.id;
  const device=await prisma.device.create({data:{companyId:company.id,name:tag,host:'127.0.0.1',managementPort:port,credentialId:credential.id,vendor:'linux',type:'linux_edge',protocol:'ssh',environment:'lab',capabilities:{}}});deviceId=device.id;
  const propose=who=>send(who,'POST','/api/commands/ai-propose',{deviceId,request:'لاگ زنده سرویس fixture-api شامل «fixture GET»'});
  assert.equal((await propose(viewer)).statusCode,403);assert.equal((await propose(denied)).statusCode,403);assert.equal((await propose(foreign)).statusCode,404);
  const proposed=await propose(operator);assert.equal(proposed.statusCode,200,'catalog proposal');const planId=proposed.json().actionPlanId;planIds.push(planId);assert.ok(planId);assert.equal(commands,0,'host-key probe never authenticates or executes');
  const preview=await send(operator,'POST',`/api/actions/${planId}/dry-run`,{});assert.equal(preview.statusCode,200);assert.equal(commands,0);
  const execute=await send(operator,'POST',`/api/actions/${planId}/quick-execute`,{intent:'execute',actionPlanRevision:Number(preview.json().parametersJson.metadata.planRevision??1)});assert.equal(execute.statusCode,200,JSON.stringify({status:execute.statusCode,error:execute.json().error,code:execute.json().code,reason:execute.json().reasonCode,detail:execute.json().detail,fixtureCommands:seen}));
  const completed=execute.json();assert.equal(completed.status,'succeeded',JSON.stringify({status:completed.status,code:completed.resultJson?.code,message:completed.resultJson?.message}));assert.equal(completed.resultJson.connectorInvoked,true);assert.equal(completed.resultJson.outcome,'live_stream_started');assert.equal(follow,1);
  const id=completed.resultJson.parsedResult.sessionId,path=`/api/commands/live-logs/${id}`;assert.ok(id);
  assert.equal((await app.inject({url:path})).statusCode,401);assert.equal((await send(foreign,'GET',path)).statusCode,404);assert.equal((await send(denied,'GET',path)).statusCode,403);
  const waiting=send(operator,'GET',path+'?cursor=0');await new Promise(resolve=>setTimeout(resolve,80));const marker=`eosnet-${randomUUID()}`;await fetch(`http://127.0.0.1:${http.address().port}/${marker}`);
  const response=await waiting;assert.equal(response.statusCode,200);const batch=response.json();assert.equal(batch.status,'live');assert.equal(batch.events.length,1);assert.ok(batch.events[0].message.includes(marker));assert.ok(!response.body.includes('fixture-sensitive-value'));assert.ok(batch.events[0].deviceTime);assert.equal(response.headers['cache-control'],'no-store');
  // Bounded ring and transparent loss; no permanent log output in action/audit records.
  for(let i=0;i<620;i++)for(const ch of streams)ch.write(JSON.stringify({MESSAGE:`fixture GET /${i}`,PRIORITY:'6'})+'\n');await new Promise(resolve=>setTimeout(resolve,200));
  const ring=(await send(operator,'GET',path+'?cursor=0')).json();assert.equal(ring.gap,true);assert.ok(ring.dropped>=120);assert.ok(ring.events.length<=200);
  assert.equal((await send(operator,'POST',path+'/stop',{})).statusCode,200);assert.equal((await send(operator,'GET',path+'?cursor=0')).json().status,'closed');
  const saved=await prisma.actionPlan.findUnique({where:{id:planId}});assert.ok(!JSON.stringify(saved).includes(marker));
  const audits=await prisma.auditLog.findMany({where:{targetId:id}});assert.ok(audits.some(a=>a.action==='linux.live_log.started'));assert.ok(!JSON.stringify(audits).includes(marker));
  probeFails=true;const failure=await propose(operator);const failedId=failure.json().actionPlanId;planIds.push(failedId);assert.equal((await send(operator,'POST',`/api/actions/${failedId}/dry-run`,{})).statusCode,200);
  const bad=await send(operator,'POST',`/api/actions/${failedId}/quick-execute`,{intent:'execute',actionPlanRevision:1});assert.notEqual(bad.json().status,'succeeded');assert.equal(follow,1,'unreadable source never starts a fake stream');
  const failedPlan=await prisma.actionPlan.findUnique({where:{id:failedId}});assert.equal(failedPlan.status,'failed');assert.equal(failedPlan.resultJson.connectorInvoked,true);
  probeFails=false;
  const pinned=(await prisma.device.findUnique({where:{id:deviceId}})).capabilities;assert.match(pinned.liveLogSshFingerprint,/^SHA256:/);
  const countBefore=commands;await prisma.device.update({where:{id:deviceId},data:{capabilities:{...pinned,liveLogSshFingerprint:'SHA256:wrong-fixture-key'}}});
  assert.equal((await propose(operator)).statusCode,409,'changed host key is rejected before credential authentication');assert.equal(commands,countBefore);await prisma.device.update({where:{id:deviceId},data:{capabilities:pinned}});
  const next=await propose(operator),nextId=next.json().actionPlanId;planIds.push(nextId);assert.ok(nextId);assert.equal((await send(operator,'POST',`/api/actions/${nextId}/dry-run`,{})).statusCode,200);
  const nextResult=await send(operator,'POST',`/api/actions/${nextId}/quick-execute`,{intent:'execute',actionPlanRevision:1});assert.equal(nextResult.statusCode,200);const nextStream=nextResult.json().resultJson.parsedResult.sessionId;
  const pending=send(operator,'GET',`/api/commands/live-logs/${nextStream}?cursor=0`);await new Promise(resolve=>setTimeout(resolve,80));
  await prisma.appUser.update({where:{id:operator.u.id},data:{allowedSections:[]}});for(const ch of streams)ch.write(JSON.stringify({MESSAGE:'fixture GET /revocation-sensitive'})+'\n');
  const revoked=await pending;assert.equal(revoked.statusCode,403,'permissions rechecked after long poll');assert.ok(!revoked.body.includes('revocation-sensitive'));
  await prisma.appUser.update({where:{id:operator.u.id},data:{allowedSections:['page:actions.center']}});
  assert.equal((await send(operator,'GET',`/api/commands/live-logs/${nextStream}?cursor=0`)).json().status,'closed');
  missingWebFile=true;const web=await send(operator,'POST','/api/commands/ai-propose',{deviceId,request:'لاگ nginx شامل «web-fixture»'});const webId=web.json().actionPlanId;planIds.push(webId);assert.ok(webId);
  assert.equal((await send(operator,'POST',`/api/actions/${webId}/dry-run`,{})).statusCode,200);const webResult=await send(operator,'POST',`/api/actions/${webId}/quick-execute`,{intent:'execute',actionPlanRevision:1});assert.equal(webResult.statusCode,200);
  const webSession=webResult.json().resultJson.parsedResult;assert.equal(webSession.query.source,'docker');assert.equal(webSession.query.container,'abcdef123456');
  const webAudit=await prisma.auditLog.findFirst({where:{targetId:webSession.sessionId,action:'linux.live_log.started'}});assert.equal(webAudit.metadata.source,'docker');
  for(const ch of streams)ch.write(new Date().toISOString()+' GET /web-fixture 200\n');
  const webRead=await send(operator,'GET',`/api/commands/live-logs/${webSession.sessionId}?cursor=0`);assert.equal(webRead.statusCode,200);assert.ok(webRead.json().events[0].message.includes('web-fixture'));assert.ok(webRead.json().events[0].deviceTime);
  await send(operator,'POST',`/api/commands/live-logs/${webSession.sessionId}/stop`,{});
 }finally{
  await app.close();for(const c of clients)c.end();await Promise.all([new Promise(resolve=>ssh.close(resolve)),new Promise(resolve=>http.close(resolve)),new Promise(resolve=>vpn.close(resolve))]);
  if(deviceId)await prisma.device.deleteMany({where:{id:deviceId}});if(credentialId)await prisma.deviceCredential.deleteMany({where:{id:credentialId}});await prisma.auditLog.deleteMany({where:{actor:{in:users}}});await prisma.appUser.deleteMany({where:{id:{in:users}}});await shutdownDatabase();await rm(dir,{recursive:true,force:true});
 }
});
