import { useSyncExternalStore } from "react";

export type Appearance = "dark" | "light";
const key = "eosnet.appearance";
const eventName = "eosnet:appearance";

function read(): Appearance {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

export function setAppearance(value: Appearance) {
  apply(value);
  let saved = true;
  try { localStorage.setItem(key, value); } catch { saved = false; }
  window.dispatchEvent(new Event(eventName));
  return saved;
}

function apply(value: Appearance) {
  document.documentElement.dataset.theme = value;
  document.documentElement.classList.toggle("dark", value === "dark");
  document.documentElement.style.colorScheme = value;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", value === "light" ? "#f8fafc" : "#07111a");
}

function subscribe(notify: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== key && event.key !== null) return;
    apply(event.newValue === "light" ? "light" : "dark");
    notify();
  };
  window.addEventListener(eventName, notify);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(eventName, notify);
    window.removeEventListener("storage", onStorage);
  };
}

export function useAppearance() {
  return useSyncExternalStore(subscribe, read, () => "dark" as Appearance);
}
