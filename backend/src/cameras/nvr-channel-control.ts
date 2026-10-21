import {createHash} from "node:crypto";
import {withAppWebSession,type AppWebRequest} from "./nvr-appweb.js";
import {decodeAppWebChannelConfig,encodeAppWebChannelConfig} from "./nvr-appweb-codec.js";
import {CameraError,type CameraCredentials} from "./camera-network.js";
const path="/CGI/NetService/decorder/channels/-1";
type Device={kind:string;connectionMode:string;host:string;onvifPort:number;onvifHttps:boolean};
const supported=(camera:Device)=>{if(camera.kind!=="nvr"||camera.connectionMode!=="appweb")throw new CameraError("NVR_CHANNEL_CONTROL_UNSUPPORTED",422);};
const canonical=(value:unknown):unknown=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.entries(value).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,canonical(item)])):value;
const digest=(value:unknown)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
function channels(config:Record<string,unknown>[]){return config.flatMap((item,index)=>{
 if(typeof item.Enable!=="boolean"||item.ConnType!=="SINGLE"||typeof item.SingleConnId!=="string"||!/^0x[0-9a-f]{1,8}$/i.test(item.SingleConnId)||!Array.isArray(item.Decoder)||item.Decoder.length>32)return[];
 const selected=parseInt(item.SingleConnId.slice(2),16)-1,decoder=item.Decoder[selected];
 if(selected<0||!decoder||typeof decoder.Address!=="string"||!decoder.Address||typeof decoder!=="object")return[];
 const clean=(value:unknown)=>typeof value==="string"?value.replace(/[\x00-\x1f\x7f]/g,"").slice(0,160):"";
 return[{index,enabled:item.Enable,name:clean(decoder.ConfName),address:clean(decoder.Address)}];
});}
async function read(request:AppWebRequest,password:string){
 const config=decodeAppWebChannelConfig((await request(path)).data,password),list=channels(config);
 if(!list.length)throw new CameraError("NVR_CHANNEL_CONTROL_UNSUPPORTED",422);
 return{config,list,revision:digest(config)};
}
export async function readNvrChannels(camera:Device,credentials:CameraCredentials){
 supported(camera);return withAppWebSession(camera.host,camera.onvifPort,camera.onvifHttps,credentials,async request=>{
  const value=await read(request,credentials.password??"");return{channels:value.list,revision:value.revision};
 });
}
export async function writeNvrChannel(camera:Device,credentials:CameraCredentials,input:{channel:number;enabled:boolean;revision:string},onInvoke:()=>void){
 supported(camera);if(!Number.isInteger(input.channel)||input.channel<0||input.channel>127||typeof input.enabled!=="boolean")throw new CameraError("NVR_CONFIG_INVALID");
 return withAppWebSession(camera.host,camera.onvifPort,camera.onvifHttps,credentials,async request=>{
  const current=await read(request,credentials.password??"");
  if(current.revision!==input.revision)throw new CameraError("NVR_CONFIG_CHANGED",409);
  const selected=current.list.find(row=>row.index===input.channel);if(!selected)throw new CameraError("NVR_CHANNEL_CONTROL_UNSUPPORTED",422);
  if(selected.enabled===input.enabled)throw new CameraError("NVR_CHANNEL_ALREADY_SET",409);
  const expected=structuredClone(current.config);expected[input.channel].Enable=input.enabled;
  const body=JSON.stringify(encodeAppWebChannelConfig(expected,credentials.password??""));
  onInvoke();const result=(await request(path,"PUT",body)).data as Record<string,unknown>;
  if(result?.statusCode!==1||result.statusString!=="OK")throw new CameraError("NVR_CONFIG_WRITE_REJECTED",502);
  const actual=await read(request,credentials.password??"");
  if(actual.revision!==digest(expected)||actual.list.find(row=>row.index===input.channel)?.enabled!==input.enabled)throw new CameraError("NVR_CONFIG_VERIFY_FAILED",502);
  return{channel:input.channel,enabled:input.enabled,verified:true};
 });
}
