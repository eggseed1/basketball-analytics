"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";

import { GlassSurface } from "@/components/brand/glass-surface";

const DISMISS_KEY = "drbl-ios-install-dismissed";

function iosSafari(): boolean {
  const ua = navigator.userAgent;
  const iOS =
    /iPad|iPhone|iPod/.test(ua) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const safari = /Safari/i.test(ua) && !/CriOS|FxiOS|EdgiOS|OPiOS|DuckDuckGo/i.test(ua);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return iOS && safari && !standalone;
}

/** Bottom tray for iPhone and iPad Safari. Hidden once the site is installed, or after dismiss. */
export function IosInstallTray() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let dismissed = false;
    try {
      dismissed = localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      dismissed = true;
    }
    if (!iosSafari() || dismissed) return;
    const timer = window.setTimeout(() => setOpen(true), 700);
    return () => window.clearTimeout(timer);
  }, []);

  function dismiss() {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch {
      /* private mode */
    }
    setOpen(false);
  }

  if (!open) return null;

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
      <GlassSurface
        role="dialog"
        aria-labelledby="ios-install-title"
        effect="liquid"
        className="pointer-events-auto w-full max-w-md px-4 py-4"
        style={{ borderRadius: 24 }}
      >
        <div className="flex items-start gap-3.5">
          <span
            aria-hidden
            className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-foreground/[0.06] text-foreground"
          >
            <svg viewBox="0 0 24 24" className="size-[22px]" fill="none" stroke="currentColor" strokeWidth="1.7">
              <path d="M12 3v10" strokeLinecap="round" />
              <path d="M8.5 6.5 12 3l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M6 10.5V19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2v-8.5" strokeLinecap="round" />
            </svg>
          </span>
          <div className="min-w-0 flex-1">
            <p id="ios-install-title" className="text-[16px] font-semibold leading-5 tracking-tight text-foreground">
              Add DRBL to your home screen
            </p>
            <p className="mt-1 text-[13px] leading-snug text-muted-foreground">
              Tap Share, then Add to Home Screen.
            </p>
          </div>
          <button
            type="button"
            onClick={dismiss}
            aria-label="Dismiss"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-foreground/[0.05] hover:text-foreground"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </GlassSurface>
    </div>
  );
}
