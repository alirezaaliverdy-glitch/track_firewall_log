import assert from 'node:assert/strict';
import test from 'node:test';
import {randomBytes,randomUUID} from 'node:crypto';
import {createServer} from 'node:http';
import {networkInterfaces} from 'node:os';
import {execFileSync} from 'node:child_process';
test('thumbnails enforce camera page/tenant/company/profile grants before cached bytes; viewers read, updates invalidate and deletion denies',async()=>{
 process.env.CREDENTIAL_ENCRYPTION_KEY=randomBytes(32).toString('hex');
 const {prisma,shutdownDatabase}=await import('../dist/db/prisma.js'),{buildApp}=await import('../dist/app.js'),{createSession}=await import('../dist/services/auth.service.js'),{encryptSecret}=await import('../dist/services/credential-crypto.service.js');
 const jpeg=execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=640x360','-frames:v','1','-threads','1','-f','image2pipe','-c:v','mjpeg','pipe:1']);
 let shots=0;const server=createServer((req,res)=>{shots++;res.setHeader('Content-Type','image/jpeg');res.end(jpeg);});await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));
 const host=Object.values(networkInterfaces()).flat().find(v=>v?.family==='IPv4'&&!v.internal).address,port=server.address().port;
 const app=await buildApp(),tag='thumbnail-'+randomUUID(),users=[],actors=[];
 const identity=async(role,workspaceOwnerId,allowedSections=['page:assets.cameras'])=>{
  const username=tag+users.length,user=await prisma.appUser.create({data:{username,displayName:'Fixture',role,workspaceOwnerId,allowedSections,passwordHash:'not-a-login'}});users.push(user.id);actors.push(username);
  const session=await createSession(user.id,{}),cookie=`firewall_session=${session.token}`,csrf=await app.inject({url:'/api/auth/csrf',headers:{cookie}});
  return{id:user.id,headers:{cookie,'x-csrf-token':csrf.json().csrfToken}};
 };
 try{
  const owner=await identity('admin'),viewer=await identity('viewer',owner.id),foreign=await identity('admin'),denied=await identity('operator',owner.id,['page:tools.vpn']);
  const company=await prisma.company.create({data:{ownerId:owner.id,name:tag,code:tag}});
  const account={username:'fixture',password:randomBytes(16).toString('hex'),profiles:{small:{snapshotUrl:`http://${host}:${port}/image`}}};
  const camera=await prisma.cameraDevice.create({data:{ownerId:owner.id,companyId:company.id,host,name:'Fixture',status:'verified',connectionEncrypted:encryptSecret(JSON.stringify(account)),profilesJson:[{token:'small',name:'Entry',sourceToken:'one',snapshotAvailable:true,streamAvailable:false,ptz:false}]}});
  const url=`/api/cameras/${camera.id}/thumbnail?profile=small`,get=(headers=viewer.headers)=>app.inject({url,headers});
  assert.equal((await app.inject({url})).statusCode,401);assert.equal((await get(denied.headers)).statusCode,403);assert.equal((await get(foreign.headers)).statusCode,404);assert.equal(shots,0);
  const first=await get();assert.equal(first.statusCode,200);assert.equal(first.headers['cache-control'],'private, no-store');assert.equal(first.headers['x-camera-stale'],'false');assert.ok(Number(first.headers['x-camera-refresh-after'])>10_790_000);assert.equal(first.headers['content-type'],'image/jpeg');assert.ok(first.rawPayload.length<128*1024);assert.equal(first.body.includes(account.password),false);
  assert.equal((await get()).headers['x-camera-captured-at'],first.headers['x-camera-captured-at']);assert.equal(shots,1);
  assert.equal((await app.inject({url:`/api/cameras/${camera.id}/thumbnail?profile=foreign`,headers:viewer.headers})).statusCode,404);assert.equal(shots,1);
  await prisma.company.update({where:{id:company.id},data:{deletedAt:new Date()}});assert.equal((await get()).statusCode,404);assert.equal(shots,1);await prisma.company.update({where:{id:company.id},data:{deletedAt:null}});
  await prisma.cameraDevice.update({where:{id:camera.id},data:{connectionEncrypted:encryptSecret(JSON.stringify({...account,password:randomBytes(16).toString('hex')}))}});assert.equal((await get()).statusCode,200);assert.equal(shots,2);
  assert.equal((await app.inject({method:'DELETE',url:`/api/cameras/${camera.id}`,headers:owner.headers})).statusCode,200);assert.equal((await get()).statusCode,404);assert.equal(shots,2);
 }finally{await app.close();await new Promise(resolve=>server.close(resolve));await prisma.auditLog.deleteMany({where:{actor:{in:actors}}});await prisma.appUser.deleteMany({where:{id:{in:users}}});await shutdownDatabase();}
});
