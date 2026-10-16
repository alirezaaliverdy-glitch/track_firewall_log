import { useEffect, useRef, useState } from "react";
import { cameraImageResponse } from "@/lib/cameras";

/** Fetch-based playback carries the same session credentials on web and native Android. */
export function useCameraImage(id: string, profile: string, playing: boolean, mode: "live" | "snapshot", retry: number) {
  const [src, setSrc] = useState("");
  const [state, setState] = useState<"idle" | "loading" | "live" | "snapshot" | "paused" | "error">("idle");
  const [error, setError] = useState("");
  const currentUrl = useRef("");
  useEffect(() => () => { if (currentUrl.current) URL.revokeObjectURL(currentUrl.current); }, []);
  useEffect(() => {
    if (!playing) { setState("paused"); return; }
    if (!profile) { setState("idle"); setSrc(""); return; }
    let disposed = false, controller: AbortController | undefined, timer: ReturnType<typeof setTimeout> | undefined;
    let generation = 0;
    let boundedFrames = Boolean(window.matchMedia?.("(pointer: coarse)").matches);
    const image = (bytes: Uint8Array) => {
      if (disposed) return;
      const next = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "image/jpeg" }));
      const previous = currentUrl.current; currentUrl.current = next; setSrc(next); if (previous) setTimeout(() => URL.revokeObjectURL(previous), 1000);
      setState(mode === "snapshot" ? "snapshot" : "live");
    };
    const start = async () => {
      if (disposed) return;
      if (document.hidden) { setState("paused"); return; }
      const activeGeneration = ++generation;
      const activeController = new AbortController(); controller = activeController; setState(current => boundedFrames && current === "live" ? current : "loading"); setError("");
      try {
        const response = await cameraImageResponse(id, profile, mode === "live" && boundedFrames ? "frame" : mode, activeController.signal);
        if (disposed || activeGeneration !== generation) return;
        if (mode === "snapshot" || boundedFrames) {
          const bytes = new Uint8Array(await response.arrayBuffer());
          if (disposed || activeGeneration !== generation) return;
          image(bytes);
          if (mode === "live") timer = setTimeout(() => void start(), 500);
          return;
        }
        if (!response.body) throw new Error("CAMERA_VIDEO_FAILED");
        const reader = response.body.getReader();
        let buffer = new Uint8Array(0);
        let receivedFrame = false;
        try {
          while (!disposed && activeGeneration === generation) {
            const { value, done } = await reader.read();
            if (disposed || activeGeneration !== generation) break;
            if (done) break;
            const next = new Uint8Array(buffer.length + value.length); next.set(buffer); next.set(value, buffer.length); buffer = next;
            if (buffer.length > 3 * 1024 * 1024) throw new Error("CAMERA_VIDEO_FAILED");
            for (;;) {
              let begin = -1, end = -1;
              for (let i = 0; i < buffer.length - 1; i++) {
                if (begin < 0 && buffer[i] === 0xff && buffer[i + 1] === 0xd8) begin = i;
                else if (begin >= 0 && buffer[i] === 0xff && buffer[i + 1] === 0xd9) { end = i + 2; break; }
              }
              if (begin < 0 || end < 0) break;
              receivedFrame = true; image(buffer.slice(begin, end)); buffer = buffer.slice(end);
            }
          }
        } finally { await reader.cancel().catch(() => undefined); }
        if (!receivedFrame && !disposed && activeGeneration === generation) throw new Error("CAMERA_VIDEO_FAILED");
        if (!disposed && activeGeneration === generation && !document.hidden) timer = setTimeout(() => void start(), 1000);
      } catch (failure) {
        if (disposed || activeGeneration !== generation || activeController.signal.aborted) return;
        if (mode === "live" && !boundedFrames) { boundedFrames = true; timer = setTimeout(() => void start(), 300); return; }
        setState("error"); setError(failure instanceof Error ? failure.message : "CAMERA_VIDEO_FAILED");
      }
    };
    const visibility = () => {
      generation++;
      if (timer) clearTimeout(timer);
      controller?.abort();
      if (document.hidden) setState("paused"); else void start();
    };
    document.addEventListener("visibilitychange", visibility); void start();
    return () => { disposed = true; if (timer) clearTimeout(timer); controller?.abort(); document.removeEventListener("visibilitychange", visibility); };
  }, [id, profile, playing, mode, retry]);
  return { src, state, error };
}
