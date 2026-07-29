"use client";

import { useEffect } from "react";

/**
 * Registers the service worker (public/sw.js) once the page has loaded.
 * Rendered from the root layout; renders nothing.
 *
 * Registration is skipped in development so an old cached worker can never
 * shadow local changes.
 */
export default function ServiceWorkerRegistrar() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;

    const register = () => {
      navigator.serviceWorker.register("/sw.js").catch((err) => {
        console.error("Service worker registration failed:", err);
      });
    };

    if (document.readyState === "complete") register();
    else {
      window.addEventListener("load", register);
      return () => window.removeEventListener("load", register);
    }
  }, []);

  return null;
}
