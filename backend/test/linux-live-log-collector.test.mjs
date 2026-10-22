import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,appendFile,rename,symlink,rm} from 'node:fs/promises';
import {createServer} from 'node:http';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
import {LIVE_LOG_COLLECTOR} from '../dist/linux/live-log-collector.js';

test('real Python collector follows vhost and container files despite existing empty default, journal and both Docker streams; bounded cleanup',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'live-sources-')),logs=join(dir,'logs'),bin=join(dir,'bin'),rows=[];let child,http;
 try{
  await mkdir(join(logs,'nginx'),{recursive:true});await mkdir(bin);
  await writeFile(join(logs,'nginx/access.log'),'');await writeFile(join(logs,'nginx/site.access.log'),'192.0.2.10 GET /virtual-host 200\n');
  await writeFile(join(logs,'custom.log'),'192.0.2.10 GET /custom-config 200\n');await writeFile(join(logs,'container.log'),'192.0.2.10 GET /container-file 200\n');
  await writeFile(join(dir,'secret'),'not a log');await symlink(join(dir,'secret'),join(logs,'nginx/secret.log'));
  const exe=async(name,body)=>writeFile(join(bin,name),'#!/usr/bin/env python3\n'+body,{mode:0o755});
  await exe('nginx',`print('access_log ${logs}/custom.log;')\nprint('access_log off;')\nprint('proxy_set_header Authorization fixture-secret-never-export;')\n`);
  await exe('journalctl',`import json,time\nprint(json.dumps({'MESSAGE':'journal fixture','PRIORITY':'6'}),flush=True)\ntime.sleep(120)\n`);
  await exe('docker',`import sys,json,os,time\na=sys.argv[1:]\nif a[0]=='ps':print(json.dumps({'ID':'abcdef123456','Names':'custom-proxy','Image':'company/custom-web','Ports':'0.0.0.0:443->443/tcp'}))\nelif a[0]=='logs':\n print('2026-10-22T10:00:00Z 192.0.2.10 GET /container-stdout',flush=True)\n print('2026-10-22T10:00:00Z 192.0.2.10 error /container-stderr',file=sys.stderr,flush=True)\n time.sleep(120)\nelif a[0]=='exec':\n cmd=a[2:]\n if cmd[0]=='nginx':print('access_log ${logs}/container.log;')\n elif cmd[0]=='readlink':print(cmd[-1])\n elif cmd[0]=='test':sys.exit(0)\n else:os.execvp(cmd[0],cmd)\n`);
  const script=LIVE_LOG_COLLECTOR.replaceAll('/var/log',logs);
  child=spawn('python3',['-u','-c',script,Buffer.from(JSON.stringify({scope:'all'})).toString('base64')],{env:{...process.env,PATH:bin+':'+process.env.PATH},stdio:['ignore','pipe','pipe']});
  let buffer='',stderr='';child.stderr.on('data',b=>stderr+=b);child.stdout.on('data',b=>{buffer+=b;let i;while((i=buffer.indexOf('\n'))>=0){rows.push(JSON.parse(buffer.slice(0,i)));buffer=buffer.slice(i+1);}});
  const exited=new Promise((resolve,reject)=>{child.once('error',reject);child.once('exit',(code,signal)=>resolve({code,signal}));});
  const end=Date.now()+15000;while(Date.now()<end&&!['/virtual-host','/custom-config','/container-file','/container-stdout','/container-stderr','journal fixture'].every(s=>rows.some(r=>r.type==='line'&&r.line.includes(s))))await new Promise(r=>setTimeout(r,100));
  for(const text of ['/virtual-host','/custom-config','/container-file','/container-stdout','/container-stderr','journal fixture'])assert.ok(rows.some(r=>r.type==='line'&&r.line.includes(text)),text+' received; '+stderr);
  assert.ok(rows.some(r=>r.type==='inventory'));assert.ok(rows.some(r=>r.type==='warning'&&r.message.includes('غیرفعال')));
  assert.ok(!JSON.stringify(rows).includes('fixture-secret-never-export'));assert.ok(!rows.some(r=>r.type==='source'&&r.label.endsWith('secret.log')));
  http=createServer(async(req,res)=>{await appendFile(join(logs,'nginx/site.access.log'),`192.0.2.10 GET ${req.url} 200\n`);res.end('ok');});await new Promise(resolve=>http.listen(0,'127.0.0.1',resolve));
  const liveAt=Date.now();assert.equal((await fetch(`http://127.0.0.1:${http.address().port}/actual-http-request`)).status,200);
  while(Date.now()-liveAt<5000&&!rows.some(r=>r.type==='line'&&r.line.includes('/actual-http-request')))await new Promise(r=>setTimeout(r,100));assert.ok(rows.some(r=>r.type==='line'&&r.line.includes('/actual-http-request')),'HTTP access row delivered while following');
  await rename(join(logs,'nginx/site.access.log'),join(logs,'nginx/site.access.log.1'));await writeFile(join(logs,'nginx/site.access.log'),'192.0.2.10 GET /after-rotation 200\n');
  const rotated=Date.now();while(Date.now()-rotated<10000&&!rows.some(r=>r.type==='line'&&r.line.includes('/after-rotation')))await new Promise(r=>setTimeout(r,100));assert.ok(rows.some(r=>r.type==='line'&&r.line.includes('/after-rotation')),'tail -F follows rotated vhost file');
  const start=Date.now();child.kill('SIGTERM');const result=await Promise.race([exited,new Promise((_,reject)=>setTimeout(()=>reject(new Error('collector did not terminate')),5000))]);assert.equal(result.code,0);assert.ok(Date.now()-start<5000);
 }finally{if(child&&child.exitCode===null&&child.signalCode===null){const done=new Promise(resolve=>child.once('exit',resolve));child.kill('SIGTERM');await Promise.race([done,new Promise(resolve=>setTimeout(resolve,4000))]);if(child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');}if(http)await new Promise(resolve=>http.close(resolve));await rm(dir,{recursive:true,force:true});}
});
