// Opt-in local acceptance; uses the saved encrypted device account inside API.
// Never prints credentials, raw configuration, filenames or customer media.
import {readFileSync} from 'node:fs';
import {spawn} from 'node:child_process';
for(const item of readFileSync('/proc/1/environ','utf8').split('\0')) {
  const i=item.indexOf('=');
  if(['DATABASE_URL','CREDENTIAL_ENCRYPTION_KEY'].includes(item.slice(0,i))) process.env[item.slice(0,i)]=item.slice(i+1);
}
process.env.LOG_LEVEL='silent';
const {prisma,shutdownDatabase}=await import('file:///app/dist/db/prisma.js');
try {
  const camera=await prisma.cameraDevice.findFirst({where:{kind:'nvr',connectionMode:'appweb',host:process.argv[2]}});
  if(!camera)throw Error('NOT_SAVED');
  const {cameraConnection}=await import('file:///app/dist/cameras/camera.service.js'),credentials=cameraConnection(camera);
  for(const mode of ['channels','replay']) {
    const child=spawn('/tmp/eosnet-taoshi-replay-probe',[],{stdio:['pipe','pipe','ignore'],timeout:30000,env:{PATH:'/usr/bin:/bin'}});
    let buf=Buffer.alloc(0),frames=0,first,last;
    child.stdout.on('data',chunk=>{
      buf=Buffer.concat([buf,chunk]);if(buf.length>3*1024*1024){child.kill();return;}
      if(mode==='channels')return;
      while(buf.length>=48&&buf.readUInt32BE(0)===0x54535231) {
        const size=buf.readUInt32BE(4);if(size>2*1024*1024){child.kill();return;}if(buf.length<48+size)return;
        last={clock:Array.from({length:6},(_,i)=>buf.readUInt32BE(16+i*4)),low:buf.readUInt32BE(40),high:buf.readUInt32BE(44)};
        if(!first)first={fps:buf.readUInt32BE(8),type:buf.readUInt32BE(12),...last,nal:buf[52],annexB:buf.subarray(48,52).equals(Buffer.from([0,0,0,1]))};
        frames++;buf=buf.subarray(48+size);if(frames>=300){child.kill();return;}
      }
    });
    child.stdin.on('error',()=>{});
    child.stdin.end([camera.host,34567,credentials.username,credentials.password,mode,...(mode==='replay'?[process.argv[5]??'0',process.argv[3]??'2026-10-19 10:00:00',process.argv[4]??'2026-10-19 10:00:10']:[]),''].join('\n'));
    await new Promise(resolve=>{child.once('error',()=>{console.log('{"code":"SDK_PROBE_FAILED"}');resolve();});child.once('close',()=>{
      let json;try{json=JSON.parse(buf.toString());}catch{}
      if(mode==='channels')console.log(JSON.stringify({mode,authenticated:json?.authenticated,mapped:json?.mapped,readCode:json?.readCode,vendorCode:json?.vendorCode,configuredChannels:json?.configuredChannels,channels:json?.channels}));
      else console.log(JSON.stringify({mode,frames,first,last,error:json?.error,vendorCode:json?.vendorCode}));resolve();
    });});
  }
} catch(e){console.log(JSON.stringify({code:e.code??'PROBE_FAILED'}));process.exitCode=1;}
finally{await shutdownDatabase();}
