import assert from "node:assert/strict";
import test from "node:test";
import { decodeAppWebChannels } from "../src/cameras/nvr-appweb-codec.js";
import { taoshiWallTime, taoshiFrameParser, taoshiCodec, taoshiRecordings } from "../src/cameras/nvr-taoshi.js";
import { reserveCameraReplay } from "../src/cameras/camera-media.js";

// Synthetic legacy envelope; not customer configuration or a device password.
const content="zPBX+mZObfuhVe4vhQ8KrpI9TWS3G0YmttzPES6uA9VJEhcbMRrgSEfBvPSPsTuQ8ohkQh8/VJ3E7Z+g8gfyNHtH9Qs10/lVtZPjZI+kWAZVw2/GdABapvGDDl/Xsb6lC+jvyEYGIO/+wjPbXtFsYiFC+7IgJnr2d9h4DM4hSrcZDiRkCAWcd923gpcrh8tmk4pvs8RN6D1OMI5jPqqVrHccK6ZopLYQCt13PLPejRfBJd3rMknSGIehRTD7mncytDXXOpFH2ay/hkok9/0zyqVeZJtfQQox0WV71IqvmHm9uiqKRkf8ndxOkCvgqyaPlhd7ViSN/cSoisE7Z+p23g==";
test("AppWeb envelope chooses only enabled selected single-source channel; drops accounts",()=>{
  assert.deepEqual(decodeAppWebChannels({Content:content},"fixture-password"),[{index:0,address:"192.168.1.2",name:"Fixture"}]);
  for(const input of [{Content:"!"},{Content:"AA=="},{Content:"A".repeat(300000)},null])assert.throws(()=>decodeAppWebChannels(input,"fixture-password"),/NVR_APPWEB_RESPONSE_INVALID/);
  assert.throws(()=>decodeAppWebChannels({Content:content},"wrong-fixture"),/NVR_APPWEB_RESPONSE_INVALID/);
});
test("recorder local clock is explicit; dates/URLs cannot inject the native stdin protocol",()=>{
  assert.equal(taoshiWallTime("2026-10-19T10:00:00.000Z"),"2026-10-19 10:00:00");
  for(const input of ["2026-02-30 10:00:00","2026-10-19 25:00:00","2026-10-19 10:00:00\nreboot","rtsp://other/video",""])assert.throws(()=>taoshiWallTime(input));
  const records=taoshiRecordings({id:"owned",host:"192.168.1.50",onvifPort:80,onvifHttps:false},[{index:14,address:"192.168.1.15",name:"entry"}]);
  assert.equal(records[0].token,"taoshi:owned:14");assert.equal(records[0].from,null);assert.equal(records[0].until,null);
});
function packet(fps=20,year=2026){const payload=Buffer.from([0,0,0,1,64,1,2,3]),header=Buffer.alloc(48);[0x54535231,payload.length,fps,1,year,10,19,10,0,0,0,0].forEach((v,i)=>header.writeUInt32BE(v,i*4));return Buffer.concat([header,payload]);}
test("native frame parser handles byte fragmentation and rejects unbounded/invalid frames",()=>{
  const values: unknown[]=[];const parse=taoshiFrameParser((data,fps,stamp,key)=>values.push({codec:taoshiCodec(data),fps,stamp,key}));
  for(const byte of packet())parse(Buffer.from([byte]));
  assert.deepEqual(values,[{codec:"hevc",fps:20,stamp:Date.UTC(2026,9,19,10),key:true}]);
  assert.equal(taoshiCodec(Buffer.from([0,0,0,1,103,1,2,3])),"h264");
  assert.throws(()=>taoshiCodec(Buffer.from("not video")));
  for(const frame of [packet(0),packet(121),packet(20,1999),Buffer.alloc(60),Buffer.alloc(3*1024*1024+1)])assert.throws(()=>taoshiFrameParser(()=>{})(frame));
});
test("ONVIF and native playback share one-per-workspace and two-global replay leases",()=>{
  const releaseA=reserveCameraReplay("fixture-replay-a");
  try{
    assert.throws(()=>reserveCameraReplay("fixture-replay-a"),/CAMERA_REPLAY_BUSY/);
    const releaseB=reserveCameraReplay("fixture-replay-b");
    try{assert.throws(()=>reserveCameraReplay("fixture-replay-c"),/CAMERA_REPLAY_BUSY/);}finally{releaseB();}
  }finally{releaseA();}
  const release=reserveCameraReplay("fixture-replay-c");release();
});
