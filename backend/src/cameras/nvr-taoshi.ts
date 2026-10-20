import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { withAppWebSession } from "./nvr-appweb.js";
import { decodeAppWebChannels } from "./nvr-appweb-codec.js";
import { CameraError, privateCameraHost, cameraPort } from "./camera-network.js";
import type { CameraConnection } from "./camera-onvif.js";
import type { CameraRecording } from "./camera-replay.js";

type Device = { id: string; host: string; onvifPort: number; onvifHttps: boolean };
export type TaoshiInventory = { channels: Array<{ index: number; address: string; name: string }>; port: number; clock: string };
const leases = new Set<string>(), cooldown = new Map<string, number>();
const object = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
export function taoshiWallTime(value: string) {
  if (!/^20\d\d-\d\d-\d\d[T ]\d\d:\d\d:\d\d(?:\.\d{3}Z|Z)?$/.test(value)) throw new CameraError("CAMERA_REPLAY_WINDOW_INVALID");
  const normalized=value.replace(" ","T").replace(/Z$/,"").slice(0,19);
  if (!Number.isFinite(Date.parse(normalized+"Z")) || new Date(normalized+"Z").toISOString().slice(0,19)!==normalized) throw new CameraError("CAMERA_REPLAY_WINDOW_INVALID");
  return normalized.replace("T"," ");
}
export async function taoshiInventory(camera: Device, connection: CameraConnection): Promise<TaoshiInventory> {
  return withAppWebSession(camera.host,camera.onvifPort,camera.onvifHttps,connection,async request=>{
    const version=object((await request("/CGI/Custom/version")).data);
    const count=[version.VideoInChannel,version.DigChannel].filter((n):n is number=>typeof n==="number"&&Number.isInteger(n)&&n>0&&n<=128);
    if(!count.length)throw new CameraError("CAMERA_REPLAY_UNSUPPORTED",422);
    const raw=(await request("/CGI/NetService/decorder/channels/-1")).data;
    const channels=decodeAppWebChannels(raw,connection.password??"").filter(c=>c.index<Math.max(...count)&&c.address).map(c=>({...c,address:privateCameraHost(c.address)}));
    const network=object((await request("/CGI/Network/netcommon")).data),clock=object((await request("/CGI/General/time")).data);
    return {channels,port:cameraPort(network.TCPPort,0),clock:taoshiWallTime(String(clock.SystemTime??""))};
  });
}
export function taoshiRecordings(camera: Device, channels: TaoshiInventory["channels"]): CameraRecording[] {
  return channels.map(c=>({token:`taoshi:${camera.id}:${c.index}`,source:`taoshi:${c.index}`,name:`${c.index+1} · ${c.address}`,from:null,until:null,tracks:[]}));
}
export async function checkTaoshiFiles(camera: Device, connection: CameraConnection, channel: number, start: string, end: string) {
  if(!Number.isInteger(channel)||channel<0||channel>127)throw new CameraError("CAMERA_RECORDING_NOT_FOUND",404);
  return withAppWebSession(camera.host,camera.onvifPort,camera.onvifHttps,connection,async request=>{
    const data=(await request("/CGI/Record/filelist","PUT",JSON.stringify({Channel:channel,Type:"h264",Event:"*",DriverTypeMask:3,BeginTime:taoshiWallTime(start),EndTime:taoshiWallTime(end)}))).data;
    if(!Array.isArray(data)||data.length>64)throw new CameraError("NVR_APPWEB_RESPONSE_INVALID",502);
    const begin=Date.parse(taoshiWallTime(start).replace(" ","T")+"Z"),finish=Date.parse(taoshiWallTime(end).replace(" ","T")+"Z");
    if(!data.some(raw=>{try{const f=object(raw),a=Date.parse(taoshiWallTime(String(f.BeginTime)).replace(" ","T")+"Z"),b=Date.parse(taoshiWallTime(String(f.EndTime)).replace(" ","T")+"Z");return a<finish&&b>begin;}catch{return false;}}))throw new CameraError("CAMERA_RECORDING_OUTSIDE_RANGE",422);
  });
}

/** Strict helper framing; only actual timestamped video frames, never live RTSP fallback. */
export function taoshiFrameParser(onFrame: (data: Buffer, fps: number, stamp: number, keyframe: boolean)=>void) {
  let buffer=Buffer.alloc(0),total=0,count=0;
  return (chunk: Buffer)=>{
    total+=chunk.length;if(total>64*1024*1024||buffer.length+chunk.length>3*1024*1024)throw new CameraError("CAMERA_REPLAY_SIZE_LIMIT",502);
    buffer=Buffer.concat([buffer,chunk]);
    while(buffer.length>=48){
      if(buffer.readUInt32BE(0)!==0x54535231)throw new CameraError("CAMERA_REPLAY_FAILED",502);
      const size=buffer.readUInt32BE(4),fps=buffer.readUInt32BE(8),type=buffer.readUInt32BE(12);
      // This SDK's delta-frame rate field may contain a default/unused value.
      // Only keyframe metadata defines the elementary stream's input rate.
      if(!size||size>2*1024*1024||type<1||type>5||type===1&&(fps<1||fps>120)||++count>7200)throw new CameraError("CAMERA_REPLAY_FAILED",502);
      if(buffer.length<48+size){count--;return;}
      const [y,m,d,h,min,s]=Array.from({length:6},(_,i)=>buffer.readUInt32BE(16+i*4));
      if(y<2000||y>2099||m<1||m>12||d<1||d>31||h>23||min>59||s>59)throw new CameraError("CAMERA_REPLAY_RANGE_UNVERIFIED",502);
      const stamp=Date.UTC(y,m-1,d,h,min,s),date=new Date(stamp);
      if(date.getUTCMonth()!==m-1||date.getUTCDate()!==d)throw new CameraError("CAMERA_REPLAY_RANGE_UNVERIFIED",502);
      const data=Buffer.from(buffer.subarray(48,48+size));buffer=buffer.subarray(48+size);
      onFrame(data,fps,stamp,type===1);
    }
  };
}
export function taoshiCodec(data: Buffer) {
  for(let i=0;i<Math.min(data.length-5,256);i++){
    const n=data[i]===0&&data[i+1]===0?(data[i+2]===1?i+3:data[i+2]===0&&data[i+3]===1?i+4:-1):-1;
    if(n<0)continue;
    if([32,33,34].includes(data[n]>>1&63))return "hevc";
    if([7,8].includes(data[n]&31))return "h264";
  }
  throw new CameraError("CAMERA_REPLAY_FAILED",502);
}
/** Keyframes carry stream metadata; delta-frame rate hints are not a rate change. */
export function taoshiStreamRate(current: number, reported: number, keyframe: boolean) {
  if (!keyframe) return current;
  if (!Number.isInteger(reported) || reported < 1 || reported > 120) throw new CameraError("CAMERA_REPLAY_FAILED",502);
  if (current && reported !== current) throw new CameraError("CAMERA_REPLAY_RATE_CHANGED",422);
  return reported;
}
/** Bounded decode preroll and transport tail; neither extends the exported clip. */
export function taoshiReplayWindow(start: string, end: string) {
  return {
    begin: taoshiWallTime(new Date(Date.parse(start)-8000).toISOString()),
    finish: taoshiWallTime(new Date(Date.parse(end)+2000).toISOString())
  };
}
export async function taoshiClip(input: { camera: Device; port: number; connection: CameraConnection; channel: number; start: string; end: string; duration: number; signal: AbortSignal }) {
  const {camera,connection,signal}=input;
  privateCameraHost(camera.host);cameraPort(input.port);
  const key=createHash("sha256").update(`${camera.host}\0${connection.username}\0${connection.password}`).digest("hex");
  for(const[k,until]of cooldown)if(until<Date.now())cooldown.delete(k);
  if(cooldown.has(key))throw new CameraError("NVR_APPWEB_AUTH_COOLDOWN",429);
  if(leases.has(camera.host)||leases.size>=2)throw new CameraError("CAMERA_REPLAY_BUSY",429);
  if(signal.aborted)throw new CameraError("CAMERA_REPLAY_CANCELLED",499);
  if(!connection.username||connection.password===undefined||connection.username.length>128||connection.password.length>256||[connection.username,connection.password].some(s=>/[\r\n\0]/.test(s)))throw new CameraError("CAMERA_AUTH_REQUIRED",401);
  leases.add(camera.host);
  try {
    const native=spawn("/usr/local/bin/taoshi-replay",[],{shell:false,windowsHide:true,env:{PATH:"/usr/bin:/bin",TZ:"UTC"}});
    native.stderr.resume();native.stdin.on("error",()=>{});
    let decoder: ReturnType<typeof spawn>|undefined, failure: CameraError|undefined;
    const stop=()=>{native.kill("SIGKILL");decoder?.kill("SIGKILL");};
    const aborted=()=>{failure=new CameraError("CAMERA_REPLAY_CANCELLED",499);stop();};
    signal.addEventListener("abort",aborted,{once:true});
    const timer=setTimeout(()=>{failure=new CameraError("CAMERA_REPLAY_TIMEOUT",504);stop();},85000);timer.unref();
    try {
      const frames: Buffer[]=[];let fps=0,first=0,last=0;
      const start=Date.parse(input.start),end=Date.parse(input.end);
      const parse=taoshiFrameParser((data,rate,stamp,keyframe)=>{
        if(stamp<start-10000||stamp>end+2000||last&&stamp<last-1000)throw new CameraError("CAMERA_REPLAY_RANGE_UNVERIFIED",502);
        if(!frames.length&&!keyframe)return;
        if(!frames.length){first=stamp;taoshiCodec(data);}
        fps=taoshiStreamRate(fps,rate,keyframe);
        if(stamp>=end){native.kill("SIGTERM");return;}
        last=stamp;frames.push(data);
      });
      // Observed GOPs can exceed three seconds. Start before the requested
      // frame, and allow the SDK's completion callback a small transport tail.
      // Only frames before `end` are retained; FFmpeg trims the decode preroll.
      const window=taoshiReplayWindow(input.start,input.end);
      native.stdin.end([camera.host,input.port,connection.username,connection.password,"replay",input.channel,window.begin,window.finish,""].join("\n"));
      await new Promise<void>((resolve,reject)=>{
        let helperError=Buffer.alloc(0),transport: "unknown"|"frames"|"error"="unknown";
        native.once("error",()=>reject(new CameraError("CAMERA_REPLAY_UNSUPPORTED",422)));
        native.stdout.on("data",(chunk: Buffer)=>{
          if(transport==="unknown")transport=chunk[0]===123?"error":"frames";
          if(transport==="error"){
            if(helperError.length+chunk.length>1024){failure=new CameraError("CAMERA_REPLAY_FAILED",502);stop();}else helperError=Buffer.concat([helperError,chunk]);return;
          }
          try{parse(chunk);}catch(e){failure=e instanceof CameraError?e:new CameraError("CAMERA_REPLAY_FAILED",502);stop();}
        });
        native.once("close",()=>{
          if(helperError.length){
            try{const result=object(JSON.parse(helperError.toString()));if(result.error==="NVR_NATIVE_AUTH_FAILED"){
              const auth=[-11300,-11301,-11302,-11303,-11304,-11314].includes(Number(result.vendorCode));
              if(auth){if(cooldown.size>=256)cooldown.delete(cooldown.keys().next().value!);cooldown.set(key,Date.now()+60000);}
              failure=new CameraError(auth?result.vendorCode===-11303?"NVR_ACCOUNT_LOCKED":"CAMERA_AUTH_FAILED":result.vendorCode===-10005?"CAMERA_TIMEOUT":"CAMERA_CONNECTION_FAILED",auth?401:502);
            }else failure=new CameraError("CAMERA_REPLAY_FAILED",502);}catch{failure=new CameraError("CAMERA_REPLAY_FAILED",502);}
          }
          failure?reject(failure):resolve();
        });
      });
      if(signal.aborted)throw new CameraError("CAMERA_REPLAY_CANCELLED",499);
      if(!frames.length||first>start||last<start+1000)throw new CameraError("CAMERA_RECORDING_OUTSIDE_RANGE",422);
      const media=Buffer.concat(frames),codec=taoshiCodec(frames[0]);
      decoder=spawn("ffmpeg",["-hide_banner","-loglevel","error","-nostdin","-threads","1","-protocol_whitelist","pipe","-f",codec,"-framerate",String(fps),"-i","pipe:0","-ss",String(Math.max(0,(start-first)/1000)),"-t",String(input.duration),"-map","0:v:0","-an","-sn","-dn","-vf","fps=12,scale=960:-2:force_original_aspect_ratio=decrease","-c:v","libx264","-threads","1","-preset","ultrafast","-pix_fmt","yuv420p","-b:v","800k","-maxrate","1000k","-bufsize","2000k","-g","24","-movflags","frag_keyframe+empty_moov+default_base_moof","-f","mp4","pipe:1"],{shell:false,windowsHide:true});
      const ffmpeg=decoder;ffmpeg.stderr!.resume();ffmpeg.stdin!.on("error",()=>{});ffmpeg.stdin!.end(media);
      return await new Promise<Buffer>((resolve,reject)=>{
        const chunks: Buffer[]=[];let bytes=0;
        ffmpeg.stdout!.on("data",(chunk: Buffer)=>{bytes+=chunk.length;if(bytes>12*1024*1024){failure=new CameraError("CAMERA_REPLAY_SIZE_LIMIT",502);stop();}else chunks.push(chunk);});
        ffmpeg.once("error",()=>reject(new CameraError("CAMERA_REPLAY_FAILED",502)));
        ffmpeg.once("close",code=>{const clip=Buffer.concat(chunks);failure?reject(failure):code===0&&clip.subarray(4,8).toString()==="ftyp"&&bytes>64?resolve(clip):reject(new CameraError("CAMERA_REPLAY_FAILED",502));});
      });
    }finally{clearTimeout(timer);signal.removeEventListener("abort",aborted);stop();}
  }finally{leases.delete(camera.host);}
}
