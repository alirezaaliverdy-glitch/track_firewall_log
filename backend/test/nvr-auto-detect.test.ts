import assert from "node:assert/strict";
import test from "node:test";
import {createServer} from "node:http";
import {networkInterfaces} from "node:os";
import {detectNvrConnection} from "../src/cameras/nvr-auto-detect.js";
test("NVR detection uses fixed read-only unauthenticated endpoints, pins host, refuses redirects and unknown vendors",async()=>{
 const host=Object.values(networkInterfaces()).flat().find(v=>v?.family==="IPv4"&&!v.internal)!.address;
 let mode="appweb";const calls:Array<{method:string;path:string;credentials:boolean}>=[];
 const server=createServer((req,res)=>{calls.push({method:req.method!,path:req.url!,credentials:Boolean(req.headers.authorization||req.headers.cookie)});
   if(mode==="appweb"&&req.url==="/doc/script/common.js"){res.end("const endpoint='/CGI/Security/sessionLogin'; var webSessionID='';");return;}
   if(mode==="onvif"&&req.url==="/onvif/device_service"){res.statusCode=401;res.setHeader("WWW-Authenticate",'Digest realm="fixture", nonce="fixture"');res.end();return;}
   if(mode==="redirect"){res.statusCode=302;res.setHeader("Location","http://example.invalid");res.end();return;}
   res.statusCode=404;res.end("<html>Not found</html>");
 });await new Promise<void>(resolve=>server.listen(0,"0.0.0.0",resolve));const port=(server.address()as{port:number}).port;
 try{assert.equal((await detectNvrConnection(host,port)).mode,"appweb");mode="onvif";assert.equal((await detectNvrConnection(host,port)).mode,"onvif");
   for(mode of ["unknown","redirect"])await assert.rejects(detectNvrConnection(host,port),/NVR_AUTO_DETECT_UNAVAILABLE/);
   assert.ok(calls.every(call=>call.method==="GET"&&!call.credentials&&["/doc/script/common.js","/onvif/device_service"].includes(call.path)));
   await assert.rejects(detectNvrConnection("8.8.8.8",port),/CAMERA_PRIVATE_IP_REQUIRED/);
 }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
});
