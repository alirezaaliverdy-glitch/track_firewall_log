import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { flushSync } from "react-dom";

/** A real viewport portal is the reliable iPhone fallback; native fullscreen is optional. */
export function useCameraFullscreen(panel: RefObject<HTMLElement | null>) {
  const [expanded, setExpanded] = useState(false);
  const previousFocus = useRef<HTMLElement | null>(null);
  const nativeActive = useRef(false);
  const close = useCallback(() => {
    if (document.fullscreenElement === panel.current) void document.exitFullscreen?.().catch(() => undefined);
    setExpanded(false);
  }, [panel]);
  const toggle = () => {
    if (expanded) { close(); return; }
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    flushSync(() => setExpanded(true));
    panel.current?.focus({ preventScroll: true });
    // Safari iPhone lacks element fullscreen. The viewport view remains open if it rejects.
    try { void panel.current?.requestFullscreen?.().catch(() => undefined); } catch { /* viewport fallback */ }
  };
  useEffect(() => {
    if (!expanded) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const keydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); close(); }
      if (event.key !== "Tab") return;
      const controls = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled),video[controls],[tabindex="0"]') ?? [])].filter(e => e.getClientRects().length);
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      if (!event.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { event.preventDefault(); first?.focus(); }
    };
    const fullscreenchange = () => {
      if (document.fullscreenElement === panel.current) nativeActive.current = true;
      else if (nativeActive.current) { nativeActive.current = false; setExpanded(false); }
    };
    document.addEventListener("keydown", keydown, true);
    document.addEventListener("fullscreenchange", fullscreenchange);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", keydown, true);
      document.removeEventListener("fullscreenchange", fullscreenchange);
      nativeActive.current = false;
      previousFocus.current?.focus({ preventScroll: true });
    };
  }, [expanded, close, panel]);
  return { expanded, toggle, close };
}
