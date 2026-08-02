"use client";

import { useEffect, useState } from "react";

/**
 * "Install app" banner.
 *
 * Android/Chrome fires `beforeinstallprompt`, which we stash and replay when
 * the teacher taps Install — that shows the real, warning-free system dialog.
 * iOS/Safari has no such API, so we detect it and show the manual
 * "Share → Add to Home Screen" instruction instead (the only way to install
 * on iOS without the App Store).
 *
 * Dismissal is remembered in localStorage so the banner isn't nagging.
 */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const DISMISS_KEY = "tmg-install-dismissed";

export default function InstallPrompt() {
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [isIos, setIsIos] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (localStorage.getItem(DISMISS_KEY) === "1") return;

    // Already running as an installed app → nothing to offer.
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      // iOS Safari exposes standalone on navigator instead.
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;
    if (standalone) return;

    const ua = window.navigator.userAgent;
    const iosDevice = /iPad|iPhone|iPod/.test(ua);
    const isSafari = /Safari/.test(ua) && !/CriOS|FxiOS|EdgiOS/.test(ua);
    if (iosDevice && isSafari) {
      setIsIos(true);
      setVisible(true);
      return;
    }

    const onPrompt = (e: Event) => {
      e.preventDefault(); // stop Chrome's mini-infobar; we drive the UI
      setDeferred(e as BeforeInstallPromptEvent);
      setVisible(true);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);

    const onInstalled = () => setVisible(false);
    window.addEventListener("appinstalled", onInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // While the banner is shown, add bottom padding to the page so it never
  // covers the last control (e.g. "+ Add section").
  useEffect(() => {
    document.body.classList.toggle("has-install-banner", visible);
    return () => document.body.classList.remove("has-install-banner");
  }, [visible]);

  if (!visible) return null;

  function dismiss() {
    localStorage.setItem(DISMISS_KEY, "1");
    setVisible(false);
  }

  async function install() {
    if (!deferred) return;
    await deferred.prompt();
    await deferred.userChoice;
    setDeferred(null);
    setVisible(false);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-50 px-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
      <div className="mx-auto flex max-w-md items-center gap-3 rounded-xl border border-zinc-300 bg-white p-3 shadow-lg">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icons/icon-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-zinc-900">Install the app</p>
          <p className="text-xs text-zinc-600">
            {isIos
              ? "Tap Share, then “Add to Home Screen”."
              : "Add to your home screen for quick access."}
          </p>
        </div>
        {!isIos && (
          <button
            onClick={install}
            className="h-11 shrink-0 rounded-md bg-emerald-700 px-4 text-xs font-semibold text-white hover:bg-emerald-800"
          >
            Install
          </button>
        )}
        <button
          onClick={dismiss}
          aria-label="Dismiss"
          className="h-11 w-11 shrink-0 rounded-md text-sm text-zinc-500 hover:bg-zinc-100"
        >
          ✕
        </button>
      </div>
    </div>
  );
}
