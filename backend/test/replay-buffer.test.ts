import test from "node:test";
import assert from "node:assert/strict";
import { ReplayBuffer } from "../../src/features/cameras/replayBuffer.js";
test("only one next clip, no cross-camera/time reuse and no unhandled failed prefetch",async()=>{
  const buffer=new ReplayBuffer<string>();let calls=0;
  buffer.prepare("camera-a:time-a",async()=>{calls++;return "a";});
  buffer.prepare("camera-a:time-a",async()=>{calls++;return "duplicate";});
  assert.equal(await buffer.take("camera-a:time-a"),"a");assert.equal(calls,1);
  buffer.prepare("camera-a:time-a",async()=>"wrong");assert.equal(await buffer.take("camera-b:time-b"),undefined);
  buffer.prepare("failure",async()=>{throw new Error("fixture");});await assert.rejects(buffer.take("failure"),/fixture/);
});
test("reset aborts pending footage, including an already-consumed in-flight promise",async()=>{
  const buffer=new ReplayBuffer<string>(),request=new AbortController();let aborted=false;
  buffer.prepare("clip",signal=>new Promise(resolve=>signal.addEventListener("abort",()=>{aborted=true;resolve("cancelled");})));
  const result=buffer.take("clip",request.signal);request.abort();assert.equal(await result,undefined);assert.equal(aborted,true);
});
