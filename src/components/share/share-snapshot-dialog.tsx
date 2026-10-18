"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import { Check, Copy, Download, Link2, Share2, X } from "lucide-react";

import { FitWidth } from "@/components/explore/fit-width";
import { useOwnerTheme } from "@/components/design-system/theme-provider";
import { SHARE_PALETTE, type ShareAppearance } from "@/components/share/share-card";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

async function captureNode(node: HTMLElement, backgroundColor: string): Promise<string> {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  const imgs = Array.from(node.querySelectorAll("img"));
  await Promise.all(
    imgs.map(
      (img) =>
        img.complete
          ? Promise.resolve()
          : new Promise<void>((resolve) => {
              img.addEventListener("load", () => resolve(), { once: true });
              img.addEventListener("error", () => resolve(), { once: true });
            })
    )
  );
  return (await import("html-to-image")).toPng(node, {
    cacheBust: true,
    pixelRatio: Math.min(2.5, (window.devicePixelRatio || 2) * 1.25),
    backgroundColor,
    filter: (el) => {
      if (!(el instanceof HTMLElement)) return true;
      return !el.hasAttribute("data-capture-exclude");
    },
  });
}

function dataUrlToFile(dataUrl: string, name: string): File {
  const [header, data] = dataUrl.split(",");
  const mime = /data:([^;]+)/.exec(header ?? "")?.[1] ?? "image/png";
  const binary = atob(data ?? "");
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

function ShareAction({
  label,
  onClick,
  icon,
  disabled,
}: {
  label: string;
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "flex w-[4.5rem] flex-col items-center gap-1.5 rounded-[var(--radius-lg)] p-1.5",
        "text-foreground transition-colors hover:bg-foreground/6",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50"
      )}
    >
      <span className="flex size-12 items-center justify-center rounded-full frost-surface text-foreground shadow-sm">
        {icon}
      </span>
      <span className={cn(type.micro, "text-center font-medium leading-tight")}>
        {label}
      </span>
    </button>
  );
}

/**
 * Bottom-sheet share dialog: copy link, download PNG, native share, post to X, copy text.
 * The graphic picks light or dark. The PNG uses that card, not the page behind it.
 */
export function ShareSnapshotDialog({
  open,
  onClose,
  fileName,
  shareTitle,
  shareText,
  canCapture,
  controls,
  graphic,
  emptyPreview,
}: {
  open: boolean;
  onClose: () => void;
  fileName: string;
  shareTitle: string;
  /** Text for X / native share / copy. Gets the page URL appended. */
  shareText: string;
  canCapture: boolean;
  controls?: ReactNode;
  graphic: (appearance: ShareAppearance) => ReactNode;
  emptyPreview?: ReactNode;
}) {
  const titleId = useId();
  const graphicRef = useRef<HTMLDivElement>(null);
  const wasOpen = useRef(false);
  const { resolvedDark } = useOwnerTheme();
  const [appearance, setAppearance] = useState<ShareAppearance>(resolvedDark ? "dark" : "light");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const palette = SHARE_PALETTE[appearance];

  const close = useCallback(() => {
    setError(null);
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (open && !wasOpen.current) setAppearance(resolvedDark ? "dark" : "light");
    wasOpen.current = open;
  }, [open, resolvedDark]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  const pageUrl = () =>
    typeof window !== "undefined" ? window.location.href : "https://drbl.io";
  const fullText = () => `${shareText}\n${pageUrl()}`;

  const flashCopied = () => {
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const runCapture = useCallback(async () => {
    const node = graphicRef.current;
    if (!node || !canCapture) throw new Error("Nothing to capture");
    setError(null);
    setBusy(true);
    // Preview sits inside a FitWidth scale; capture at 1x so the PNG stays crisp.
    const scaleWrap = node.parentElement;
    const prevTransform = scaleWrap?.style.transform ?? "";
    if (scaleWrap) scaleWrap.style.transform = "none";
    try {
      return await captureNode(node, palette.canvas);
    } finally {
      if (scaleWrap) scaleWrap.style.transform = prevTransform;
      setBusy(false);
    }
  }, [canCapture, palette.canvas]);

  const downloadPng = useCallback(async () => {
    try {
      const dataUrl = await runCapture();
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = fileName;
      a.click();
    } catch {
      setError("Could not create image. Try again.");
    }
  }, [fileName, runCapture]);

  const shareNative = async () => {
    try {
      const dataUrl = await runCapture();
      const file = dataUrlToFile(dataUrl, fileName);
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], title: shareTitle, text: fullText() });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: shareTitle, text: shareText, url: pageUrl() });
        return;
      }
      await downloadPng();
      await navigator.clipboard.writeText(pageUrl());
      flashCopied();
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError("Share cancelled or unavailable.");
    }
  };

  const shareX = async () => {
    try {
      await downloadPng();
    } catch {
      /* still open the post */
    }
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(fullText())}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  };

  const copy = async (text: string, failure: string) => {
    try {
      await navigator.clipboard.writeText(text);
      flashCopied();
    } catch {
      setError(failure);
    }
  };

  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center px-[max(0px,env(safe-area-inset-left))] pr-[max(0px,env(safe-area-inset-right))] sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        aria-label="Close share"
        className="absolute inset-0 bg-[var(--surface-scrim)] backdrop-blur-[2px]"
        onClick={close}
      />
      <div
        className={cn(
          "relative z-[1] flex max-h-[min(92vh,100dvh)] min-h-0 w-full max-w-lg flex-col overflow-hidden",
          "rounded-t-[var(--radius-2xl)] border border-border/70 shadow-[var(--shadow-overlay)]",
          "frost-surface pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-2xl)] sm:pb-4"
        )}
      >
        <div className="flex items-center justify-between gap-3 px-4 pt-4 sm:px-5 sm:pt-5">
          <button
            type="button"
            onClick={close}
            className="inline-flex size-9 items-center justify-center rounded-full frost-surface text-foreground"
            aria-label="Close"
          >
            <X className="size-4" />
          </button>
          <h2 id={titleId} className={cn(type.title, "font-semibold")}>
            Share
          </h2>
          <span className="size-9" aria-hidden />
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 py-4 sm:px-5">
          <SegmentedControl
            size="sm"
            label="Appearance"
            value={appearance}
            onChange={setAppearance}
            options={[
              { id: "light", label: "Light" },
              { id: "dark", label: "Dark" },
            ]}
          />

          {controls}

          <div
            className="min-w-0 overflow-hidden rounded-[var(--radius-xl)] border border-border/50 p-2 sm:p-3"
            style={{ background: palette.canvas }}
          >
            {canCapture ? (
              <div className="mx-auto max-h-[32vh] overflow-y-auto overflow-x-hidden">
                <FitWidth className="mx-auto w-full min-w-0">
                  <div ref={graphicRef}>{graphic(appearance)}</div>
                </FitWidth>
              </div>
            ) : (
              emptyPreview
            )}
          </div>
        </div>

        <div className="frost-surface relative z-10 flex shrink-0 justify-center gap-1 border-t border-border/60 px-2 pt-3 touch-scroll-x">
          <ShareAction
            label={copied ? "Copied" : "Copy link"}
            icon={copied ? <Check className="size-5" /> : <Link2 className="size-5" />}
            onClick={() => void copy(pageUrl(), "Could not copy link.")}
          />
          <ShareAction
            label="Download"
            icon={<Download className="size-5" />}
            disabled={busy || !canCapture}
            onClick={() => void downloadPng()}
          />
          <ShareAction
            label="Share…"
            icon={<Share2 className="size-5" />}
            disabled={busy || !canCapture}
            onClick={() => void shareNative()}
          />
          <ShareAction
            label="Post to X"
            icon={<span className="text-[13px] font-bold leading-none">X</span>}
            disabled={busy || !canCapture}
            onClick={() => void shareX()}
          />
          <ShareAction
            label="Copy text"
            icon={<Copy className="size-5" />}
            onClick={() => void copy(fullText(), "Could not copy text.")}
          />
        </div>

        {error ? (
          <p className={cn(type.caption, "text-center text-destructive")}>{error}</p>
        ) : null}
      </div>
    </div>,
    document.body
  );
}
