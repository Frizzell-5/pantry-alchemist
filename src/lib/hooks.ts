import { useEffect, useState } from "react";

/** Keeps the screen on while `active`, re-acquiring after the tab returns. */
export function useWakeLock(active: boolean) {
  const [supported] = useState(() => "wakeLock" in navigator);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (!active || !supported) return;
    let sentinel: WakeLockSentinel | null = null;
    let cancelled = false;
    const acquire = async () => {
      try {
        sentinel = await navigator.wakeLock.request("screen");
        if (cancelled) return void sentinel.release();
        setLocked(true);
        sentinel.addEventListener("release", () => setLocked(false));
      } catch {
        setLocked(false);
      }
    };
    const onVisible = () => document.visibilityState === "visible" && acquire();
    acquire();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      sentinel?.release().catch(() => {});
    };
  }, [active, supported]);
  return { supported, locked };
}

export function useHashRoute(): string[] {
  const read = () => (location.hash.replace(/^#\/?/, "").replace(/\?.*$/, "") || "pantry").split("/").map(decodeURIComponent);
  const [route, setRoute] = useState(read);
  useEffect(() => {
    const on = () => {
      setRoute(read());
      window.scrollTo({ top: 0 });
    };
    window.addEventListener("hashchange", on);
    return () => window.removeEventListener("hashchange", on);
  }, []);
  return route;
}

export const go = (path: string) => {
  location.hash = "/" + path;
};
