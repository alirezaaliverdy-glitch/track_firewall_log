// Isolated QA server only; generated ephemeral certificates are never printed.
import { execFileSync,spawn } from 'node:child_process';
import { mkdtemp,writeFile,readFile,rm,chmod } from 'node:fs/promises';
import {randomBytes} from 'node:crypto';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
const dir=await mkdtemp(join(tmpdir(),'ovpn-server-')),run=(file,args)=>execFileSync(file,args,{cwd:dir,stdio:'ignore'});
const username='fixture-client',password=randomBytes(24).toString('hex');
await writeFile(join(dir,'check-auth'),`#!/bin/sh\n[ "$(sed -n '1p' "$1")" = "${username}" ] && [ "$(sed -n '2p' "$1")" = "${password}" ]\n`,{mode:0o700});await chmod(join(dir,'check-auth'),0o700);
run('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-keyout','ca.key','-out','ca.crt','-days','1','-subj','/CN=EOSNET-QA-CA']);
for(const name of ['server','client']){
 run('openssl',['req','-newkey','rsa:2048','-nodes','-keyout',`${name}.key`,'-out',`${name}.csr`,'-subj',`/CN=EOSNET-QA-${name}`]);
 await writeFile(join(dir,`${name}.ext`),`basicConstraints=CA:FALSE\nkeyUsage=digitalSignature,keyEncipherment\nextendedKeyUsage=${name==='server'?'serverAuth':'clientAuth'}\n`);
 run('openssl',['x509','-req','-in',`${name}.csr`,'-CA','ca.crt','-CAkey','ca.key','-CAcreateserial','-out',`${name}.crt`,'-days','1','-extfile',`${name}.ext`]);
}
run('ip',['address','add','192.168.242.1/32','dev','lo']);
let child;
async function stop(){if(!child)return;const p=child;child=null;p.kill('SIGTERM');await new Promise(r=>{if(p.exitCode!==null)return r();const timer=setTimeout(()=>{p.kill('SIGKILL');r();},1500);p.once('exit',()=>{clearTimeout(timer);r();});});}
const server=createServer(async(req,res)=>{try{
 if(req.url==='/ready'){res.end('{}');return;}
 if(req.url==='/restart'){await stop();res.end('{}');return;}
 const transport=req.url==='/tcp'?'tcp':'udp',auth=req.url==='/auth';await stop();
 await writeFile(join(dir,'server.conf'),`port 1194\nproto ${transport==='tcp'?'tcp-server':'udp'}\ndev tun-server\ntopology subnet\nserver 10.250.250.0 255.255.255.0\nca ${dir}/ca.crt\ncert ${dir}/server.crt\nkey ${dir}/server.key\ndh none\nremote-cert-tls client\nverify-client-cert ${auth?'none':'require'}\n${auth?`script-security 2\nauth-user-pass-verify ${dir}/check-auth via-file\n`:''}tls-version-min 1.2\ndata-ciphers AES-256-GCM:AES-128-GCM\npush "redirect-gateway def1"\npush "dhcp-option DNS 8.8.8.8"\npush "route 192.168.243.0 255.255.255.0"\nverb 0\n`);
 child=spawn('openvpn',['--config',join(dir,'server.conf')],{stdio:'ignore'});child.on('error',()=>{});await new Promise(r=>setTimeout(r,700));if(child.exitCode!==null)throw new Error();
 const endpoint=process.env.FIXTURE_ENDPOINT;const profile=`client\ndev tun\nproto ${transport==='tcp'?'tcp-client':'udp'}\nremote ${endpoint} 1194\n${auth?"auth-user-pass\n":""}redirect-gateway def1\ndhcp-option DNS 8.8.8.8\n`+(await Promise.all([['ca','ca.crt'],['cert','client.crt'],['key','client.key']].map(async([tag,file])=>`<${tag}>\n${(await readFile(join(dir,file),'utf8')).trim()}\n</${tag}>\n`))).join('');
 res.setHeader('Content-Type','application/json');res.end(JSON.stringify({profile,...(auth?{username,password}:{})}));
}catch{res.statusCode=500;res.end('{"code":"FIXTURE_FAILED"}');}});
server.listen(8055,'0.0.0.0');process.once('SIGTERM',async()=>{await stop();server.close();await rm(dir,{recursive:true,force:true});process.exit(0);});
