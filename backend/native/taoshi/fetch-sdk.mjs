// Fetch only pinned development artifacts from the manufacturer-linked SDK.
// No sample accounts, cloud application keys, executables or complete archive extraction.
import { inflateRawSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { writeFileSync, mkdirSync } from 'node:fs';
const url = 'https://tscloud-uswest.oss-us-west-1.aliyuncs.com/Resources%20and%20Tools/Resources/SDK/SdkLib.zip';
const files = [
  ['NetSdkModule.h',30552048,50369,'ec405e95386a6ca4414bf00480d88cac92411c5c98bfaef35a131932acf82a98'],
  ['libBasic.a',35524529,11228,'8d1077d051c567c85ef60aec0193e4518e8939060e546e9c2b979a4ec2f16cbf'],
  ['libNetSDK.a',35535849,189573,'07a6f4927b189b13c96026a36f26b1f74d42705ac06d733f57fbd0b177059a5f'],
  ['libStreamParaser.a',37305708,15266,'5a2fec983de58eb9ab8bb8f98d3f3b4b67d348c19f12afb5b822ad3f79ad6bf8'],
  ['libTPLayer.a',37321067,29420,'942bfe97ad6d9e00a7ff96b6f4cacec153da6114d5878c63e3b6ada02a159ea7'],
];
mkdirSync('/sdk', { recursive:true });
for (const [name,start,size,sha] of files) {
  const response=await fetch(url,{headers:{Range:`bytes=${start}-${start+size-1}`},signal:AbortSignal.timeout(30000)});
  if(response.status!==206 || response.headers.get('content-length')!==String(size)) throw Error('SDK_RANGE_INVALID');
  const data=inflateRawSync(Buffer.from(await response.arrayBuffer()),{maxOutputLength:2*1024*1024});
  if(createHash('sha256').update(data).digest('hex')!==sha) throw Error('SDK_HASH_MISMATCH');
  writeFileSync('/sdk/'+name,data);
}
