import assert from "node:assert/strict";
import { test } from "node:test";
import { generateKeyPairSync, randomBytes } from "node:crypto";
import ssh2 from "ssh2";
const { Server } = ssh2;
import { TerminalRuntime, TERMINAL_LIMITS, terminalSize } from "../src/terminal/terminal-runtime.js";
import { sshHostKeySha256Fingerprint } from "../src/security/ssh-host-key-trust.js";
import { hasPermission } from "../src/security/permissions.js";
import { findMutationPermission } from "../src/security/authorization.js";

test("interactive terminal authenticates real SSH PTY, preserves shell state and closes isolated sessions",async()=>{
  const key=generateKeyPairSync("rsa",{modulusLength:2048}).privateKey.export({type:"pkcs1",format:"pem"});
  const password=randomBytes(24).toString("base64"),audits:unknown[]=[],windows:number[]=[];let authentications=0,commands=0;
  const sockets=new Set<import("ssh2").Connection>();
  const server=new Server({hostKeys:[key]},client=>{
    sockets.add(client);client.on("error",()=>{});client.on("close",()=>sockets.delete(client));
    client.on("authentication",ctx=>{authentications++;if(ctx.method==="password"&&ctx.username==="fixture"&&ctx.password===password)ctx.accept();else ctx.reject();});
    client.on("ready",()=>client.on("session",accept=>{
      const session=accept();let cwd="/fixture";
      session.on("pty",(accept)=>accept?.());session.on("window-change",(accept,_reject,info)=>{windows.push(info.cols);accept?.();});
      session.on("shell",accept=>{const channel=accept();channel.write("\x1b[32mfixture\x1b[0m $ ");channel.on("data",(bytes:Buffer)=>{
        commands++;const input=bytes.toString();
        if(input.includes("cd /tmp"))cwd="/tmp";
        if(input==="burst\r")channel.write(Buffer.alloc(320*1024,65));
        else if(input==="exit\r"){channel.write("goodbye\r\n");channel.end();}
        else channel.write(input==="\u0003"?"^C\r\n":input==="pwd\r"?`${cwd}\r\n`:input);
      });});
    }));
  });
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const port=(server.address() as {port:number}).port,owner={userId:"u",ownerId:"workspace",sessionHash:"session-a"},identity={...owner,deviceId:"d",revision:"r",fingerprint:"fixture"};
  const runtime=new TerminalRuntime(async audit=>{audits.push(audit);});
  const config={host:"127.0.0.1",port,username:"fixture",password,readyTimeout:3000,hostVerifier:(raw:Buffer)=>!!sshHostKeySha256Fingerprint(raw)};
  const wait=async(fn:()=>boolean)=>{for(let i=0;i<80;i++){if(fn())return;await new Promise(resolve=>setTimeout(resolve,25));}assert.fail("SSH fixture condition timed out");};
  try{
    await assert.rejects(runtime.open(identity,config,{cols:80,rows:24},async()=>{throw new Error("audit down");}),/TERMINAL_AUDIT_UNAVAILABLE/);assert.equal(authentications,0,"audit failure must prevent SSH login");
    const result=await runtime.open(identity,config,{cols:80,rows:24},async()=>{});assert.equal(result.state,"connected");
    assert.throws(()=>runtime.read(result.id,{...owner,sessionHash:"other"},0),/TERMINAL_NOT_FOUND/);
    assert.throws(()=>runtime.input(result.id,owner,2,"pwd\r"),/TERMINAL_INPUT_SEQUENCE/);
    runtime.input(result.id,owner,1,"cd /tmp\r");await wait(()=>commands===1);
    runtime.input(result.id,owner,2,"pwd\r");await wait(()=>commands===2);
    await wait(()=>Buffer.from(runtime.read(result.id,owner,0).data,"base64").toString().includes("/tmp"));
    assert.throws(()=>runtime.input(result.id,owner,2,"pwd\r"),/TERMINAL_INPUT_SEQUENCE/,"replay is rejected");
    runtime.input(result.id,owner,3,"\u0003");runtime.resize(result.id,owner,100,30);await wait(()=>windows.includes(100));
    runtime.input(result.id,owner,4,"burst\r");await wait(()=>runtime.read(result.id,owner,0).truncated);
    let cursor=0,readBytes=0;while(true){const chunk=runtime.read(result.id,owner,cursor);cursor=chunk.cursor;readBytes+=Buffer.from(chunk.data,"base64").length;if(!chunk.hasMore)break;}
    assert.ok(readBytes<=TERMINAL_LIMITS.retentionBytes,"server output storage stays bounded");
    assert.throws(()=>runtime.input(result.id,owner,5,"x".repeat(32769)),/TERMINAL_INPUT_LIMIT/);
    runtime.input(result.id,owner,5,"exit\r");await wait(()=>runtime.read(result.id,owner,cursor).state==="closed");
    assert.match(Buffer.from(runtime.read(result.id,owner,cursor).data,"base64").toString(),/goodbye/);
    const second=await runtime.open(identity,config,{cols:80,rows:24},async()=>{});runtime.sweep(Date.now()+TERMINAL_LIMITS.leaseMs+1);assert.equal(runtime.read(second.id,owner,0).reason,"browser_disconnected");
    assert.equal(runtime.active(),0);assert.ok(audits.length>=2);assert.equal(JSON.stringify(audits).includes(password),false);assert.equal(JSON.stringify(audits).includes("cd /tmp"),false);
  }finally{await runtime.shutdown();for(const client of sockets)client.end();await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
test("terminal permissions and bounds preserve viewer/operator isolation",()=>{
  assert.equal(hasPermission("admin","devices.terminal"),true);assert.equal(hasPermission("operator","devices.terminal"),false);assert.equal(hasPermission("viewer","devices.terminal"),false);
  assert.equal(findMutationPermission("POST","/api/devices/d/terminal/sessions"),"devices.terminal");
  for(const size of [[0,24],[80,0],[241,24],[80,81],["80",24]])assert.throws(()=>terminalSize(...size as [unknown,unknown]),/TERMINAL_SIZE_INVALID/);
});
