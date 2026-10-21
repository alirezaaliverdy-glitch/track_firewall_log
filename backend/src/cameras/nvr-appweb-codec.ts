import { CameraError } from "./camera-network.js";
import { dvripPasswordHash } from "./nvr-dvrip.js";

// AppWeb's legacy DES envelope uses least-significant-bit-first bytes/nibbles.
// This is only a decoder for authenticated device configuration, not encryption for EOSNET storage.
const IP = [58,50,42,34,26,18,10,2,60,52,44,36,28,20,12,4,62,54,46,38,30,22,14,6,64,56,48,40,32,24,16,8,57,49,41,33,25,17,9,1,59,51,43,35,27,19,11,3,61,53,45,37,29,21,13,5,63,55,47,39,31,23,15,7];
const FP = [40,8,48,16,56,24,64,32,39,7,47,15,55,23,63,31,38,6,46,14,54,22,62,30,37,5,45,13,53,21,61,29,36,4,44,12,52,20,60,28,35,3,43,11,51,19,59,27,34,2,42,10,50,18,58,26,33,1,41,9,49,17,57,25];
const PC1 = [57,49,41,33,25,17,9,1,58,50,42,34,26,18,10,2,59,51,43,35,27,19,11,3,60,52,44,36,63,55,47,39,31,23,15,7,62,54,46,38,30,22,14,6,61,53,45,37,29,21,13,5,28,20,12,4];
const PC2 = [14,17,11,24,1,5,3,28,15,6,21,10,23,19,12,4,26,8,16,7,27,20,13,2,41,52,31,37,47,55,30,40,51,45,33,48,44,49,39,56,34,53,46,42,50,36,29,32];
const E = [32,1,2,3,4,5,4,5,6,7,8,9,8,9,10,11,12,13,12,13,14,15,16,17,16,17,18,19,20,21,20,21,22,23,24,25,24,25,26,27,28,29,28,29,30,31,32,1];
const P = [16,7,20,21,29,12,28,17,1,15,23,26,5,18,31,10,2,8,24,14,32,27,3,9,19,13,30,6,22,11,4,25];
const S = [
  ["e4d12fb83a6c5907","0f74e2d1a6cb9538","41e8d62bfc973a50","fc8249175b3ea06d"],
  ["f18e6b34972dc05a","3d47f28ec01a69b5","0e7ba4d158c6932f","d8a13f42b67c05e9"],
  ["a09e63f51dc7b428","d709346a285ecbf1","d6498f30b12c5ae7","1ad069874fe3b52c"],
  ["7de3069a1285bc4f","d8b56f03472c1ae9","a690cb7df13e5284","3f06a1d8945bc72e"],
  ["2c417ab6853fd0e9","eb2c47d150fa3986","421bad78f9c5630e","b8c71e2d6f09a453"],
  ["c1af92680d34e75b","af427c9561de0b38","9ef528c3704a1db6","432c95fabe17608d"],
  ["4b2ef08d3c975a61","d0b7491ae35c2f86","14bdc37eaf680592","6bd814a7950fe23c"],
  ["d2846fb1a93e50c7","1fd8a374c56b0e92","7b419ce206adf358","21e74a8dfc90356b"],
].map(rows => rows.map(row => [...row].map(n => parseInt(n,16))));
const bits = (buffer: Buffer) => Array.from({ length: buffer.length * 8 }, (_, i) => buffer[i >> 3] >> (i & 7) & 1);
const permute = (input: number[], table: number[]) => table.map(i => input[i - 1]);

function crypt(encrypted: Buffer, password: string, encode = false) {
  let key = permute(bits(Buffer.from(dvripPasswordHash(password))),PC1);
  const subkeys = [1,1,2,2,2,2,2,2,1,2,2,2,2,2,2,1].map(shift => {
    const left=key.slice(0,28),right=key.slice(28);key=[...left.slice(shift),...left.slice(0,shift),...right.slice(shift),...right.slice(0,shift)]; return permute(key,PC2);
  });
  const f = (half: number[], subkey: number[]) => {
    const expanded=permute(half,E).map((b,i)=>b^subkey[i]), out: number[]=[];
    for(let j=0;j<8;j++){const v=expanded.slice(j*6,j*6+6),n=S[j][v[0]*2+v[5]][v[1]*8+v[2]*4+v[3]*2+v[4]];for(let i=0;i<4;i++)out.push(n>>i&1);}return permute(out,P);
  };
  const decoded=Buffer.alloc(encrypted.length);
  for(let offset=0;offset<encrypted.length;offset+=8){
    const block=permute(bits(encrypted.subarray(offset,offset+8)),IP);let left=block.slice(0,32),right=block.slice(32);
    for(let step=0;step<16;step++){const round=encode?step:15-step,modified=f(encode?right:left,subkeys[round]);[left,right]=encode?[right,left.map((b,i)=>b^modified[i])]:[right.map((b,i)=>b^modified[i]),left];}
    const plain=permute([...left,...right],FP);for(let i=0;i<64;i++)decoded[offset+(i>>3)]|=plain[i]<<(i&7);
  }
  return decoded;
}
/** Sensitive complete configuration remains server-side; never expose or audit it. */
export function decodeAppWebChannelConfig(input: unknown, password: string): Record<string,unknown>[] {
  if (!input || typeof input !== "object" || !("Content" in input) || typeof input.Content !== "string" || input.Content.length > 256 * 1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(input.Content)) throw new CameraError("NVR_APPWEB_RESPONSE_INVALID", 502);
  const encrypted=Buffer.from(input.Content,"base64");if(!encrypted.length||encrypted.length%8)throw new CameraError("NVR_APPWEB_RESPONSE_INVALID",502);
  const decoded=crypt(encrypted,password);
  try {
    const terminator=decoded.indexOf(0);
    const value: unknown=JSON.parse(decoded.subarray(0,terminator<0?decoded.length:terminator).toString("utf8"));
    if(!Array.isArray(value)||value.length>128||value.some(item=>!item||typeof item!=="object"||Array.isArray(item)))throw Error();
    return value;
  } catch { throw new CameraError("NVR_APPWEB_RESPONSE_INVALID",502); }
  finally { decoded.fill(0); }
}
export function encodeAppWebChannelConfig(value: Record<string,unknown>[], password: string) {
  if(!Array.isArray(value)||value.length>128)throw new CameraError("NVR_APPWEB_RESPONSE_INVALID",502);
  const raw=Buffer.from(JSON.stringify(value));
  if(raw.length>190*1024)throw new CameraError("NVR_APPWEB_RESPONSE_INVALID",502);
  const padded=Buffer.alloc(Math.ceil((raw.length+1)/8)*8);raw.copy(padded);raw.fill(0);
  try{return{Content:crypt(padded,password,true).toString("base64")};}finally{padded.fill(0);}
}
export function decodeAppWebChannels(input: unknown, password: string) {
    return decodeAppWebChannelConfig(input,password).flatMap((item,index)=>{
      if(item?.Enable!==true || item.ConnType!=="SINGLE" || typeof item.SingleConnId!=="string" || !/^0x[0-9a-f]{1,8}$/i.test(item.SingleConnId) || !Array.isArray(item.Decoder) || item.Decoder.length>32)return [];
      const selected=Number.parseInt(item.SingleConnId.slice(2),16)-1;
      if(selected<0||selected>=item.Decoder.length)return [];
      const decoder=item.Decoder[selected];
      return [{index,address:typeof decoder?.Address==="string"?decoder.Address:"",name:typeof decoder?.ConfName==="string"?decoder.ConfName.replace(/[\x00-\x1f\x7f]/g,"").slice(0,160):""}];
    });
}
