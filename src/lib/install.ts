import { useEffect, useState } from "react";

// Chrome/Edge/Android fire `beforeinstallprompt` once, possibly before React
// mounts, so it's captured at import time. iOS Safari never fires it; there the
// UI shows "Share → Add to Home Screen" instructions instead.

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

let deferred: InstallPromptEvent | null = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault();
    deferred = e as InstallPromptEvent;
    emit();
  });
  window.addEventListener("appinstalled", () => {
    deferred = null;
    try { localStorage.setItem("pantry-alchemist:installed", "1"); } catch { /* ignore */ }
    emit();
  });
}

export function registerServiceWorker() {
  // Only in production builds, so the Vite dev server never serves stale cached code.
  if ("serviceWorker" in navigator && import.meta.env.PROD) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }
}

export type Platform = "ios" | "android" | "desktop";

export function useInstall() {
  const [, force] = useState(0);
  useEffect(() => {
    const l = () => force((n) => n + 1);
    listeners.add(l);
    return () => void listeners.delete(l);
  }, []);
  const ua = navigator.userAgent;
  const platform: Platform = /iphone|ipad|ipod/i.test(ua) || (/macintosh/i.test(ua) && navigator.maxTouchPoints > 1) ? "ios" : /android/i.test(ua) ? "android" : "desktop";
  const standalone = matchMedia("(display-mode: standalone)").matches || (navigator as { standalone?: boolean }).standalone === true;
  return {
    platform,
    standalone,
    canPrompt: !!deferred,
    async prompt(): Promise<boolean> {
      if (!deferred) return false;
      await deferred.prompt();
      const { outcome } = await deferred.userChoice;
      deferred = null;
      emit();
      return outcome === "accepted";
    },
  };
}
