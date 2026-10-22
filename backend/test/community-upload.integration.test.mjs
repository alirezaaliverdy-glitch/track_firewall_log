// Real HTTP + browser-style FormData. Disposable database and synthetic bytes only.
import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID,createHash} from 'node:crypto';

test('chat attachments: file-only mobile JPEG above 5 MiB, UTF-8 names, retries and private exact download over HTTP',async()=>{
 process.env.AUTH_SESSION_SECRET=randomBytes(32).toString('hex');process.env.LOG_LEVEL='silent';
 const {prisma,shutdownDatabase}=await import('../dist/db/prisma.js'),{buildApp}=await import('../dist/app.js'),{createSession}=await import('../dist/services/auth.service.js');
 const app=await buildApp(),tag='upload-'+randomUUID(),users=[];let url;
 try{
  url=await app.listen({port:0,host:'127.0.0.1'});
  async function identity(role,owner){const user=await prisma.appUser.create({data:{username:tag+'-'+users.length,displayName:'Upload fixture',role,workspaceOwnerId:owner,passwordHash:'not-a-login',allowedSections:['page:community']}});users.push(user.id);const {token}=await createSession(user.id,{}),headers={cookie:'firewall_session='+token};headers['x-csrf-token']=(await (await fetch(url+'/api/auth/csrf',{headers})).json()).csrfToken;return {id:user.id,headers};}
  const admin=await identity('admin'),viewer=await identity('viewer',admin.id),foreign=await identity('admin');
  const thread=await prisma.communityThread.create({data:{workspaceId:admin.id,creatorId:viewer.id,clientKey:randomUUID(),title:'Private attachment fixture',kind:'ticket'}}),path=`/api/community/threads/${thread.id}`;
  const data=Buffer.alloc(6*1024*1024,65);data.set([255,216,255]);const key=randomUUID();
  async function upload(name,bytes,{clientKey=key,body='',fileFirst=false}={}){const form=new FormData();if(fileFirst)form.append('files',new Blob([bytes]),name);form.set('body',body);form.set('clientKey',clientKey);if(!fileFirst)form.append('files',new Blob([bytes]),name);const res=await fetch(url+path+'/messages/files',{method:'POST',headers:viewer.headers,body:form});return {status:res.status,data:await res.json()};}
  const result=await upload('IMG_5015.jpeg',data);assert.equal(result.status,200,JSON.stringify({status:result.status,code:result.data.error}));assert.equal(result.data.message.body,'');assert.equal(result.data.message.attachments[0].size,data.length);
  assert.equal((await upload('IMG_5015.jpeg',data)).data.message.id,result.data.message.id,'retry remains idempotent');
  const file=result.data.message.attachments[0],download=await fetch(url+path+'/attachments/'+file.id,{headers:admin.headers});assert.equal(download.status,200);assert.equal(createHash('sha256').update(Buffer.from(await download.arrayBuffer())).digest('hex'),createHash('sha256').update(data).digest('hex'));
  assert.equal((await fetch(url+path+'/attachments/'+file.id,{headers:foreign.headers})).status,404);
  assert.equal((await fetch(url+path+'/attachments/'+file.id)).status,401);
  const unicode=await upload('عکس ۱۲۳.jpeg',data,{clientKey:randomUUID(),fileFirst:true});assert.equal(unicode.status,200,JSON.stringify({code:unicode.data.error}));assert.equal(unicode.data.message.attachments[0].fileName,'عکس ۱۲۳.jpeg');
  assert.equal(await prisma.communityAttachment.count({where:{workspaceId:admin.id}}),2);
  // Inject a storage failure only in the disposable DB. Response must not expose row bytes.
  const failedKey=randomUUID();await prisma.$executeRawUnsafe(`ALTER TABLE "CommunityAttachment" ADD CONSTRAINT "qa_upload_store_failure" CHECK ("fileName" <> 'store-failure.jpeg')`);
  try{const failed=await upload('store-failure.jpeg',data,{clientKey:failedKey});assert.equal(failed.status,500);assert.equal(failed.data.error,'COMMUNITY_FILE_STORE_FAILED');assert.match(failed.data.requestId,/^[A-Za-z0-9_-]+$/);assert.ok(!JSON.stringify(failed.data).includes('data:'));assert.equal(await prisma.communityMessage.count({where:{threadId:thread.id,clientKey:failedKey}}),0);}
  finally{await prisma.$executeRawUnsafe('ALTER TABLE "CommunityAttachment" DROP CONSTRAINT "qa_upload_store_failure"');}
  const recovered=await upload('store-failure.jpeg',data,{clientKey:failedKey});assert.equal(recovered.status,200);assert.equal(await prisma.communityAttachment.count({where:{workspaceId:admin.id}}),3);
  const opaqueFiles=[['archive.zip',Buffer.from([80,75,3,4,0,255])],['report.docx',Buffer.from([80,75,3,4,1,254])],['page.html',Buffer.from('<script>throw new Error("must never run")</script>')]];
  const form=new FormData();form.set('body','');form.set('clientKey',randomUUID());for(const [name,bytes]of opaqueFiles)form.append('files',new Blob([bytes],{type:'text/html'}),name);
  const opaque=await fetch(url+path+'/messages/files',{method:'POST',headers:viewer.headers,body:form});assert.equal(opaque.status,200);const receipt=await opaque.json();assert.equal(receipt.message.attachments.length,3);
  for(const file of receipt.message.attachments){const original=opaqueFiles.find(([name])=>name===file.fileName)[1];assert.equal(file.mimeType,'application/octet-stream');const download=await fetch(url+path+'/attachments/'+file.id,{headers:viewer.headers});assert.equal(download.status,200);assert.equal(download.headers.get('content-type'),'application/octet-stream');assert.match(download.headers.get('content-disposition'),/^attachment;/);assert.equal(download.headers.get('x-content-type-options'),'nosniff');assert.match(download.headers.get('content-security-policy'),/sandbox/);assert.equal(download.headers.get('cache-control'),'private, no-store');assert.deepEqual(Buffer.from(await download.arrayBuffer()),original);assert.equal((await fetch(url+path+'/attachments/'+file.id,{headers:foreign.headers})).status,404);}
 }finally{await app.close();await prisma.auditLog.deleteMany({where:{actor:{in:users}}});await prisma.appUser.deleteMany({where:{id:{in:users}}});await shutdownDatabase();}
});
