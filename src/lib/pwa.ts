export function registerPwaServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD && import.meta.env.VITE_ENABLE_PWA !== "true") return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
  }, { once: true });
}
