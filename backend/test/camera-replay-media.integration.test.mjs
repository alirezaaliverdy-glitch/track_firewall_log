import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import childProcess from 'node:child_process';
import {syncBuiltinESMExports} from 'node:module';
import {createServer} from 'node:net';
import {networkInterfaces} from 'node:os';
import {recordedCameraClip,stopCameraStreams} from '../dist/cameras/camera-media.js';
import {rtspParser} from '../dist/cameras/replay-rtsp.js';

test('actual FFmpeg decodes clock-selected replay into bounded H.264 MP4; a live reply fails closed',async t=>{
 let diagnostic='';const originalSpawn=childProcess.spawn;childProcess.spawn=(...args)=>{const child=originalSpawn(...args);child.stderr?.on('data',chunk=>{diagnostic=(diagnostic+chunk.toString()).slice(-2000);});return child;};syncBuiltinESMExports();t.after(()=>{childProcess.spawn=originalSpawn;syncBuiltinESMExports();});
 const host=Object.values(networkInterfaces()).flat().find(i=>i?.family==='IPv4'&&!i.internal)?.address;assert.ok(host);
 const bytes=execFileSync('ffmpeg',['-hide_banner','-loglevel','error','-f','lavfi','-i','testsrc2=size=320x180:rate=6','-t','8','-c:v','libx264','-threads','1','-pix_fmt','yuv420p','-tune','zerolatency','-preset','ultrafast','-x264-params','keyint=6:aud=1','-f','h264','pipe:1'],{maxBuffer:2*1024*1024});
 const nals=[];let begin=-1;
 for(let i=0;i<bytes.length-3;i++){const len=bytes[i]===0&&bytes[i+1]===0&&(bytes[i+2]===1?3:bytes[i+2]===0&&bytes[i+3]===1?4:0);if(len){if(begin>=0)nals.push(bytes.subarray(begin,i));begin=i+len;i+=len-1;}}
 if(begin>=0)nals.push(bytes.subarray(begin));const sps=nals.find(n=>(n[0]&31)===7),pps=nals.find(n=>(n[0]&31)===8);assert.ok(sps&&pps);
 const frames=[];let frame=[];for(const nal of nals){if((nal[0]&31)===9&&frame.length){frames.push(frame);frame=[];}frame.push(nal);}if(frame.length)frames.push(frame);
 let port=0,mode='replay',observedPlay=false;const sockets=new Set(),trace=[];
 const server=createServer(socket=>{sockets.add(socket);let interval,sequence=1,frameIndex=0,rtpChannel=0;
  const stop=()=>{clearInterval(interval);sockets.delete(socket);};socket.on('close',stop);socket.on('error',stop);
  const packet=(payload,marker,timestamp)=>{const rtp=Buffer.alloc(12);rtp[0]=128;rtp[1]=96|(marker?128:0);rtp.writeUInt16BE(sequence++&65535,2);rtp.writeUInt32BE(timestamp,4);rtp.writeUInt32BE(12345,8);const transport=Buffer.alloc(4);transport[0]=36;transport[1]=rtpChannel;transport.writeUInt16BE(rtp.length+payload.length,2);socket.write(Buffer.concat([transport,rtp,payload]));};
  const send=()=>{if(frameIndex>=frames.length){clearInterval(interval);return;}const timestamp=90000+frameIndex*15000;const frame=frames[frameIndex++];for(let n=0;n<frame.length;n++){const nal=frame[n];if(nal.length<1100)packet(nal,n===frame.length-1,timestamp);else for(let off=1;off<nal.length;off+=1000){const last=off+1000>=nal.length,fu=Buffer.from([(nal[0]&224)|28,(nal[0]&31)|(off===1?128:0)|(last?64:0)]);packet(Buffer.concat([fu,nal.subarray(off,off+1000)]),last&&n===frame.length-1,timestamp);}}};
  const parse=rtspParser(message=>{const method=message.line.split(' ')[0],cseq=message.headers.get('cseq');trace.push(method);let headers='',body='';
   if(method==='OPTIONS')headers='Public: OPTIONS, DESCRIBE, SETUP, PLAY, TEARDOWN, GET_PARAMETER\r\n';
   if(method==='DESCRIBE'){headers=`Content-Type: application/sdp\r\nContent-Base: rtsp://${host}:${port}/archive/\r\n`;body=`v=0\r\no=- 1 1 IN IP4 ${host}\r\ns=synthetic recording\r\nc=IN IP4 ${host}\r\nt=0 0\r\na=control:*\r\nm=video 0 RTP/AVP 96\r\na=rtpmap:96 H264/90000\r\na=fmtp:96 packetization-mode=1;profile-level-id=${sps.subarray(1,4).toString('hex')};sprop-parameter-sets=${sps.toString('base64')},${pps.toString('base64')}\r\na=control:trackID=0\r\n`;}
   if(method==='SETUP'){assert.match(message.headers.get('require')??'',/onvif-replay/);rtpChannel=Number(/interleaved=(\d+)-/.exec(message.headers.get('transport'))?.[1]??0);headers=`Transport: RTP/AVP/TCP;unicast;interleaved=${rtpChannel}-${rtpChannel+1}\r\nSession: 12345\r\n`;}
   if(method==='PLAY'){observedPlay=true;assert.match(message.headers.get('range'),/^clock=20260101T/);headers=`Session: 12345\r\nRange: ${mode==='replay'?message.headers.get('range'):'npt=0-'}\r\n`;}
   socket.write(`RTSP/1.0 200 OK\r\nCSeq: ${cseq}\r\n${headers}Content-Length: ${Buffer.byteLength(body)}\r\n\r\n${body}`);
   if(method==='PLAY'&&mode==='replay')interval=setInterval(send,25);
   if(method==='TEARDOWN'){clearInterval(interval);socket.end();}
  },()=>{});socket.on('data',chunk=>{try{parse(Buffer.from(chunk));}catch{socket.destroy();}});
 });
 await new Promise(resolve=>server.listen(0,'0.0.0.0',resolve));port=server.address().port;
 t.after(()=>{stopCameraStreams();for(const socket of sockets)socket.destroy();server.close();});
 const input={ownerId:'synthetic-owner',cameraId:'synthetic-replay',host,uri:new URL(`rtsp://${host}:${port}/archive/`),connection:{},start:'2026-01-01T00:00:00Z',end:'2026-01-01T00:00:05Z',duration:5};
 let clip;try{clip=await recordedCameraClip(input);}catch(error){throw new Error(`${error.code}; synthetic protocol methods: ${trace.join(',')}; fixture-only FFmpeg: ${diagnostic.replace(/rtsp:\/\/\S+/g,'[fixture RTSP]')}`);}assert.equal(clip.subarray(4,8).toString(),'ftyp');assert.ok(clip.length>2000&&clip.length<12*1024*1024);assert.ok(observedPlay);
 const info=await new Promise((resolve,reject)=>{const probe=originalSpawn('ffprobe',['-v','error','-show_entries','stream=codec_name,width,height','-of','json','pipe:0']);let body='',err='';probe.stdout.on('data',b=>body+=b);probe.stderr.on('data',b=>err+=b);probe.stdin.on('error',e=>{if(e.code!=='EPIPE')reject(e);});probe.on('error',reject);probe.on('close',code=>{if(code!==0)reject(new Error(`fixture probe: ${err}`));else {try{resolve(JSON.parse(body));}catch(e){reject(e);}}});probe.stdin.end(clip);});assert.equal(info.streams[0].codec_name,'h264');
 mode='live';await assert.rejects(recordedCameraClip(input),error=>error.code==='CAMERA_REPLAY_RANGE_UNVERIFIED');
 const controller=new AbortController();controller.abort();await assert.rejects(recordedCameraClip({...input,signal:controller.signal}),error=>error.code==='CAMERA_REPLAY_CANCELLED');
});
