export function registerPwaServiceWorker() {
  if (!("serviceWorker" in navigator)) return;
  if (!import.meta.env.PROD && import.meta.env.VITE_ENABLE_PWA !== "true") return;

  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" })
      .then((registration) => {
        registration.addEventListener("updatefound", () => {
          const installingWorker = registration.installing;
          if (!installingWorker) return;
          installingWorker.addEventListener("statechange", () => {
            if (installingWorker.state === "installed" && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent("app:pwa-update", { detail: { ready: true } }));
            }
          });
        });
      })
      .catch(() => undefined);
  }, { once: true });

  navigator.serviceWorker.addEventListener("message", (event) => {
    if (event.data?.type === "PWA_READY") {
      window.dispatchEvent(new CustomEvent("app:pwa-ready", { detail: { offlineShell: true } }));
    }
  });
}
