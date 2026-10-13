import assert from "node:assert/strict";
import { test } from "node:test";
import { startCameraMedia, cameraSnapshot, stopCameraStreams } from "../dist/cameras/camera-media.js";

test("FFmpeg decodes a real synthetic RTSP stream, produces a JPEG snapshot and releases live-view capacity", async () => {
  const url = process.env.CAMERA_RTSP_FIXTURE_URL;
  assert.ok(url, "Use the disposable RTSP test fixture, never a production camera.");
  const host = new URL(url).hostname;
  const input = { ownerId: "fixture-owner", cameraId: "fixture-camera", host, profile: "manual", connection: { rtspUrl: url } };
  try {
    const image = await cameraSnapshot(input);
    assert.equal(image[0], 0xff); assert.equal(image[1], 0xd8); assert.ok(image.length > 1000);
    const jobs = [];
    for (let i = 0; i < 4; i++) jobs.push(await startCameraMedia({ ...input, cameraId: `fixture-${i}` }));
    await assert.rejects(startCameraMedia(input), (error) => error.code === "CAMERA_VIEW_LIMIT");
    const chunk = await new Promise((resolve, reject) => { jobs[0].stream.once("data", resolve); jobs[0].stream.once("error", reject); });
    assert.match(chunk.toString("latin1"), /--firewall-camera/);
    stopCameraStreams();
    const next = await startCameraMedia(input); next.stop();
  } finally { stopCameraStreams(); }
});
