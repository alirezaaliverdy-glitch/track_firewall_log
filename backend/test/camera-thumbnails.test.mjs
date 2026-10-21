import assert from 'node:assert/strict';
import test from 'node:test';
import {execFileSync} from 'node:child_process';
import {CameraThumbnailCache,THUMBNAIL_INTERVAL_MS} from '../dist/cameras/camera-thumbnail-cache.js';
import {resizeCameraThumbnail} from '../dist/cameras/camera-thumbnail.js';
const bytes=Buffer.from([255,216,1,2,255,217]),key={ownerId:'owner',cameraId:'camera',profile:'profile',revision:'one'};
test('three-hour cache coalesces requests, preserves timestamps, separates owners/profiles and invalidates revisions',async()=>{
 let now=1000,calls=0;const cache=new CameraThumbnailCache({maxBytes:1024,maxEntries:10,now:()=>now});const load=async()=>{calls++;return bytes;};
 await Promise.all([cache.get(key,load),cache.get(key,load)]);assert.equal(calls,1);now+=THUMBNAIL_INTERVAL_MS-1;
 assert.equal((await cache.get(key,load)).capturedAt,1000);assert.equal(calls,1);now++;
 assert.equal((await cache.get(key,load)).capturedAt,now);assert.equal(calls,2);
 await cache.get({...key,profile:'another'},load);await cache.get({...key,ownerId:'another'},load);await cache.get({...key,revision:'two'},load);assert.equal(calls,5);
 cache.clear('camera');await cache.get(key,load);assert.equal(calls,6);
});
test('failed refresh returns explicitly stale last image, backs off and expires; no-image failures never fabricate a frame',async()=>{
 let now=1000,calls=0;const cache=new CameraThumbnailCache({maxBytes:1024,maxEntries:10,now:()=>now});
 await cache.get(key,async()=>bytes);now+=THUMBNAIL_INTERVAL_MS;
 const bad=async()=>{calls++;throw new Error('private error');};
 const stale=await cache.get(key,bad);assert.equal(stale.stale,true);assert.equal(stale.capturedAt,1000);
 await cache.get(key,bad);assert.equal(calls,1);now+=300_000;await cache.get(key,bad);assert.equal(calls,2);
 now+=24*3600_000;await assert.rejects(cache.get(key,bad),/CAMERA_THUMBNAIL_UNAVAILABLE/);
 await assert.rejects(cache.get({...key,profile:'missing'},bad),/CAMERA_THUMBNAIL_UNAVAILABLE/);
});
test('cache is byte/entry bounded and rejects oversized frames and concurrent decoder floods',async()=>{
 let now=1;const cache=new CameraThumbnailCache({maxBytes:bytes.length,maxEntries:1,now:()=>now++});let calls=0;const load=async()=>{calls++;return bytes;};
 await cache.get(key,load);await cache.get({...key,profile:'two'},load);await cache.get(key,load);assert.equal(calls,3);
 assert.deepEqual((await cache.get(key,async()=>{throw new Error('must not recapture');})).bytes,bytes);
 const busy=new CameraThumbnailCache();let finish;const pending=new Promise(resolve=>finish=resolve);
 const first=busy.get(key,async()=>{await pending;return bytes;}),second=busy.get({...key,profile:'two'},async()=>{await pending;return bytes;});
 await assert.rejects(busy.get({...key,profile:'three'},load),/CAMERA_THUMBNAIL_BUSY/);finish();await Promise.all([first,second]);
 await assert.rejects(busy.get({...key,profile:'large'},async()=>Buffer.alloc(200_000)),/CAMERA_THUMBNAIL_UNAVAILABLE/);
});
test('actual FFmpeg produces a small valid JPEG without files; malformed and excessive dimensions fail closed',async()=>{
 const input=execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','testsrc2=size=960x540','-frames:v','1','-threads','1','-f','image2pipe','-c:v','mjpeg','pipe:1']);
 const output=await resizeCameraThumbnail(input);assert.ok(output.length<128*1024);assert.deepEqual([...output.subarray(0,2)],[255,216]);assert.ok(output.length<input.length);
 await assert.rejects(resizeCameraThumbnail(Buffer.from('not an image')),/CAMERA_THUMBNAIL_UNAVAILABLE/);
 await assert.rejects(resizeCameraThumbnail(Buffer.from([255,216,255,192,0,8,8,255,255,255,255,0])),/CAMERA_THUMBNAIL_UNAVAILABLE/);
});
