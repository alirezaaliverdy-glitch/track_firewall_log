import { spawn } from "node:child_process";
import { CameraError } from "./camera-network.js";

/** Refuse oversized JPEG dimensions before invoking the bounded local decoder. */
function validateJpeg(input: Buffer) {
  if (input.length > 2 * 1024 * 1024 || input[0] !== 255 || input[1] !== 216) throw new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE", 502);
  for (let at=2; at+4<input.length;) {
    if(input[at++]!==255)break;while(input[at]===255)at++;
    const marker=input[at++];if(marker===218||marker===217)break;
    const length=input.readUInt16BE(at);if(length<2||at+length>input.length)break;
    if([192,193,194,195,197,198,199,201,202,203,205,206,207].includes(marker)) {
      if(length<8)break;const height=input.readUInt16BE(at+3),width=input.readUInt16BE(at+5);
      if(width>0&&height>0&&width*height<=16_777_216)return;
      break;
    }
    at+=length;
  }
  throw new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE", 502);
}
export async function resizeCameraThumbnail(input: Buffer): Promise<Buffer> {
  validateJpeg(input);
  return new Promise((resolve,reject)=>{
    const child=spawn("ffmpeg",["-hide_banner","-loglevel","error","-nostdin","-max_alloc","33554432","-threads","1","-filter_threads","1","-f","mjpeg","-i","pipe:0","-frames:v","1","-vf","scale=480:270:force_original_aspect_ratio=decrease","-an","-c:v","mjpeg","-threads","1","-q:v","7","-f","image2pipe","pipe:1"],{shell:false,windowsHide:true});
    const chunks:Buffer[]=[];let length=0,done=false;
    const finish=(ok=false)=>{if(done)return;done=true;clearTimeout(timeout);if(!ok){child.kill("SIGKILL");reject(new CameraError("CAMERA_THUMBNAIL_UNAVAILABLE",502));}else resolve(Buffer.concat(chunks));};
    const timeout=setTimeout(()=>finish(),6000);timeout.unref();
    child.stderr.resume();child.stdin.on("error",()=>finish());child.on("error",()=>finish());
    child.stdout.on("data",(chunk:Buffer)=>{length+=chunk.length;if(length>128*1024)finish();else chunks.push(chunk);});
    child.on("close",code=>finish(code===0&&length>4));child.stdin.end(input);
  });
}
