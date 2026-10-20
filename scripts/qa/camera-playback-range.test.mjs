import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewRange,reviewSegment} from '../../src/features/cameras/playbackRange.ts';
const start=Date.parse('2026-01-01T00:00:00Z'),now=start+86400000*2;
test('review range is past, ordered and bounded to 24 hours',()=>{
 assert.deepEqual(reviewRange(new Date(start).toISOString(),new Date(start+3600000).toISOString(),now),{start,end:start+3600000});
 for(const [a,b] of [[start,start],[start,start+4000],[start,start+86400001],[start,now+1000],[NaN,start+60000],[start,start-5000]])assert.throws(()=>reviewRange(Number.isFinite(a)?new Date(a).toISOString():'invalid',new Date(b).toISOString(),now));
});
test('long review produces bounded 5–60-second segments, not a large export',()=>{
 const range={start,end:start+3600000};
 for(const target of [start-10000,start,start+1000,start+65000,range.end-3000,range.end+60000]){const segment=reviewSegment(range,target);assert.ok(segment.start>=range.start);assert.ok(segment.duration>=5&&segment.duration<=60);assert.ok(segment.start+segment.duration*1000<=range.end);assert.ok(segment.offset>=0&&segment.offset<=segment.duration);}
});
test('the final sub-five-second tail overlaps a valid segment without leaving the selected range',()=>{
 const range={start,end:start+65000},segment=reviewSegment(range,start+64000);assert.equal(segment.start,start+60000);assert.equal(segment.duration,5);assert.equal(segment.offset,4);
});
test('invalid seek coordinates fail before any network request',()=>{
 assert.throws(()=>reviewSegment({start,end:start+60000},NaN));assert.throws(()=>reviewSegment({start,end:start},start));
});
test('native recorders advertise shorter bounded segments without changing ONVIF defaults',()=>{
 const range={start,end:start+300000};assert.equal(reviewSegment(range,start,15).duration,15);assert.equal(reviewSegment(range,start).duration,60);
 for(const invalid of [0,4,61,NaN,15.5])assert.throws(()=>reviewSegment(range,start,invalid));
});
