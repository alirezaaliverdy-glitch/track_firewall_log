import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {networkInterfaces} from 'node:os';
import {encodeAppWebChannelConfig,decodeAppWebChannelConfig} from '../dist/cameras/nvr-appweb-codec.js';

test('legacy AppWeb encoder preserves complete nested configuration and bounded JSON; malformed envelopes fail',()=>{
 const config=[{Enable:true,ConnType:'SINGLE',SingleConnId:'0x1',Decoder:[{Address:'192.168.210.11',ConfName:'Fixture',Password:'synthetic-secret',Other:[1,2]}]},{Enable:false,Other:{Retain:true}}];
 const encoded=encodeAppWebChannelConfig(config,'fixture');assert.deepEqual(decodeAppWebChannelConfig(encoded,'fixture'),config);assert.equal(JSON.stringify(encoded).includes('synthetic-secret'),false);
 assert.throws(()=>decodeAppWebChannelConfig(encoded,'wrong'),/NVR_APPWEB_RESPONSE_INVALID/);assert.throws(()=>encodeAppWebChannelConfig([{a:'x'.repeat(200*1024)}],'fixture'),/NVR_APPWEB_RESPONSE_INVALID/);
});
test('actual channel control requires preview/confirm/role, changes only Enable, verifies read-back, rejects stale plans and never leaks decoder accounts',async()=>{
 process.env.CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('hex');
 const {prisma,shutdownDatabase}=await import('../dist/db/prisma.js'),{buildApp}=await import('../dist/app.js'),{createSession}=await import('../dist/services/auth.service.js'),{encryptSecret}=await import('../dist/services/credential-crypto.service.js');
 const password=randomBytes(16).toString('hex'),tag='channels-'+randomUUID(),users=[],actors=[];let writes=0,ackOnly=false;
 let config=[{Enable:true,ConnType:'SINGLE',SingleConnId:'0x1',Decoder:[{Address:'192.168.210.11',ConfName:'Entry',Password:password}],Retain:7},{Enable:false,ConnType:'SINGLE',SingleConnId:'0x1',Decoder:[{Address:'192.168.210.12',ConfName:'Parking',Password:password}],Retain:9}];
 const initial=structuredClone(config);
 const server=createServer(async(req,res)=>{const path=req.url.split('?')[0];res.setHeader('Content-Type','application/json');const send=data=>res.end(JSON.stringify(data));
  if(path==='/CGI/Security/sessionLogin')return send({statusValue:200,salt:'fixture',sessionID:'fixture'});
  if(path==='/CGI/Security/SelfExt/userCheck')return send({statusValue:200,sessionID:'fixture'});
  if(path==='/CGI/Security/Lougout')return send({statusValue:200});
  assert.match(req.headers.cookie,/webSessionID=fixture/);
  if(path==='/CGI/NetService/decorder/channels/-1'){
   if(req.method==='PUT'){let body='';for await(const chunk of req)body+=chunk;assert.equal(body.includes(password),false);const next=decodeAppWebChannelConfig(JSON.parse(body),password);writes++;if(!ackOnly)config=next;return send({statusCode:1,statusString:'OK'});}
   assert.equal(req.method,'GET');return send(encodeAppWebChannelConfig(config,password));
  }
  res.statusCode=404;res.end();
 });await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
 const host=Object.values(networkInterfaces()).flat().find(v=>v?.family==='IPv4'&&!v.internal).address,port=server.address().port,app=await buildApp();
 const identity=async(role,workspaceOwnerId)=>{const username=tag+users.length,user=await prisma.appUser.create({data:{username,displayName:'Fixture',role,workspaceOwnerId,passwordHash:'not-a-login',allowedSections:['page:assets.cameras']}});users.push(user.id);actors.push(username);const session=await createSession(user.id,{}),cookie=`firewall_session=${session.token}`,csrf=await app.inject({url:'/api/auth/csrf',headers:{cookie}});return{id:user.id,headers:{cookie,'x-csrf-token':csrf.json().csrfToken}};};
 try{
  const owner=await identity('admin'),operator=await identity('operator',owner.id),viewer=await identity('viewer',owner.id),foreign=await identity('admin');
  const company=await prisma.company.create({data:{name:tag,code:tag,ownerId:owner.id}}),camera=await prisma.cameraDevice.create({data:{ownerId:owner.id,companyId:company.id,kind:'nvr',connectionMode:'appweb',status:'verified',host,onvifPort:port,name:'Fixture NVR',connectionEncrypted:encryptSecret(JSON.stringify({username:'fixture',password}))}});
  const url=`/api/cameras/${camera.id}`;
  const read=await app.inject({url:url+'/nvr/channels',headers:viewer.headers});assert.equal(read.statusCode,200);assert.deepEqual(read.json().channels.map(x=>x.enabled),[true,false]);assert.equal(read.body.includes(password),false);assert.equal(read.body.includes('Decoder'),false);assert.equal((await app.inject({url:url+'/nvr/channels',headers:foreign.headers})).statusCode,404);
  const preview=(value,headers=operator.headers)=>app.inject({method:'POST',url:url+'/actions/preview',headers,payload:{operation:'nvr_channel_enable',channel:'0',value}});
  assert.equal((await preview('false',viewer.headers)).statusCode,403);assert.equal((await preview('invalid')).statusCode,400);assert.equal(writes,0);
  assert.equal((await app.inject({method:'POST',url:url+'/actions/preview',headers:operator.headers,payload:{operation:'nvr_channel_enable',channel:null,value:'false'}})).statusCode,400);
  let plan=await preview('false');assert.equal(plan.statusCode,200);assert.equal(plan.json().preview.connectorInvoked,false);assert.equal(plan.body.includes(password),false);
  const execute=(id,confirmed=true)=>app.inject({method:'POST',url:url+`/actions/${id}/execute`,headers:operator.headers,payload:{intent:'execute',confirmed}});
  assert.equal((await execute(plan.json().id,false)).statusCode,400);assert.equal(writes,0);
  let result=await execute(plan.json().id);assert.equal(result.json().status,'succeeded');assert.equal(result.json().verified,true);assert.equal(result.json().connectorInvoked,true);assert.deepEqual(config,[{...initial[0],Enable:false},initial[1]]);assert.equal(writes,1);assert.equal((await execute(plan.json().id)).statusCode,409);
  plan=await preview('true');config[1].Retain=10;result=await execute(plan.json().id);assert.equal(result.json().code,'NVR_CONFIG_CHANGED');assert.equal(result.json().connectorInvoked,false);assert.equal(writes,1);
  plan=await preview('true');ackOnly=true;result=await execute(plan.json().id);assert.equal(result.json().status,'failed');assert.equal(result.json().code,'NVR_CONFIG_VERIFY_FAILED');assert.equal(result.json().connectorInvoked,true);assert.equal(config[0].Enable,false);
  ackOnly=false;plan=await preview('true');result=await execute(plan.json().id);assert.equal(result.json().status,'succeeded');assert.equal(config[0].Enable,true);
  const audit=await prisma.auditLog.findMany({where:{actor:actors[1]}});assert.ok(audit.some(row=>row.action==='camera.action_result'));assert.equal(JSON.stringify(audit).includes(password),false);
 }finally{await app.close();await new Promise(resolve=>server.close(resolve));await prisma.auditLog.deleteMany({where:{actor:{in:actors}}});await prisma.appUser.deleteMany({where:{id:{in:users}}});await shutdownDatabase();}
});
