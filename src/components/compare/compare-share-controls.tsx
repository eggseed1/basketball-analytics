"use client";

import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { createPortal } from "react-dom";
import {
  Check,
  Copy,
  Download,
  Link2,
  Share2,
  X,
} from "lucide-react";
import { toPng } from "html-to-image";

import type { ComparisonDimension, PlayerComparisonResult } from "@/analytics";
import { PlayerHeadshot } from "@/components/brand/player-headshot";
import { FitWidth } from "@/components/explore/fit-width";
import { SegmentedControl } from "@/components/ui/segmented-control";
import { type } from "@/lib/design-system";
import { resolveTeamBrand, teamChartColor } from "@/lib/nba-brand";
import { cn } from "@/lib/utils";

type ShareLayout = "clean" | "bars";

/** Fixed center column so left/right value+bar columns stay mirrored across rows. */
const SHARE_ROW_GRID =
  "grid grid-cols-[minmax(0,1fr)_5.75rem_minmax(0,1fr)] items-center gap-x-3";

/** Sensible defaults for social graphics — trimmed if a metric is missing. */
const DEFAULT_SHARE_METRIC_IDS = [
  "pts",
  "trb",
  "ast",
  "stl",
  "blk",
  "tov",
  "fgPct",
  "fg3Pct",
  "ftPct",
  "ts",
  "darko",
  "raptor",
  "war1",
  "drbl100",
] as const;

const FALLBACK_A = "#FDB927"; // Lakers-ish gold when brand missing
const FALLBACK_B = "#EEE1C6"; // Bucks cream when brand missing

function compareShareText(result: PlayerComparisonResult, pageUrl: string) {
  const seasonBit =
    result.seasonA && result.seasonB
      ? result.seasonA === result.seasonB
        ? result.seasonA
        : `${result.seasonA} vs ${result.seasonB}`
      : result.season ?? "compare";
  return `${result.aName} vs ${result.bName} (${seasonBit}) — DRBL player compare\n${pageUrl}`;
}

function slugFileName(result: PlayerComparisonResult) {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
  const a = clean(result.aName).slice(0, 24);
  const b = clean(result.bName).slice(0, 24);
  const sa = (result.seasonA ?? result.season ?? "season").replace(
    /[^0-9a-z-]/gi,
    ""
  );
  const sb = (result.seasonB ?? result.season ?? sa).replace(
    /[^0-9a-z-]/gi,
    ""
  );
  return `drbl-compare-${a}-vs-${b}-${sa}-${sb}.png`;
}

function lastName(name: string) {
  const parts = name.trim().split(/\s+/);
  return (parts[parts.length - 1] ?? name).toUpperCase();
}

function seasonLabel(result: PlayerComparisonResult, side: "a" | "b") {
  if (side === "a") return result.seasonA ?? result.season ?? "";
  return result.seasonB ?? result.season ?? "";
}

function sideWins(d: ComparisonDimension, side: "a" | "b") {
  if (d.delta == null || !Number.isFinite(d.delta)) return false;
  if (Math.abs(d.delta) < 0.05) return false;
  return side === "a" ? d.delta > 0 : d.delta < 0;
}

function shareSideColor(teamKey: string | undefined, fallback: string) {
  const chart = teamChartColor(teamKey, { surface: "dark" });
  if (chart.abbr && chart.abbr !== "-") return chart.color;
  const brand = resolveTeamBrand(teamKey);
  if (brand) {
    return teamChartColor(brand.abbr, { surface: "dark" }).color;
  }
  return fallback;
}

async function captureNode(node: HTMLElement): Promise<string> {
  await new Promise((r) => requestAnimationFrame(() => r(null)));
  // Wait for images inside the card.
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
  return toPng(node, {
    cacheBust: true,
    pixelRatio: Math.min(2.5, (window.devicePixelRatio || 2) * 1.25),
    backgroundColor: "#0c0c0e",
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

function CompareShareGraphic({
  result,
  metrics,
  layout,
}: {
  result: PlayerComparisonResult;
  metrics: ComparisonDimension[];
  layout: ShareLayout;
}) {
  const aSeason = seasonLabel(result, "a");
  const bSeason = seasonLabel(result, "b");
  const aColor = shareSideColor(result.aTeamKey, FALLBACK_A);
  const bColor = shareSideColor(result.bTeamKey, FALLBACK_B);

  return (
    <div
      className="w-[540px] max-w-[540px] shrink-0 select-none px-7 pb-7 pt-8 text-white"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, #1a1a1f 0%, #0c0c0e 55%, #080809 100%)",
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
      }}
    >
      <div className="grid grid-cols-2 gap-6">
        {(
          [
            {
              id: result.aId,
              name: result.aName,
              season: aSeason,
              color: aColor,
            },
            {
              id: result.bId,
              name: result.bName,
              season: bSeason,
              color: bColor,
            },
          ] as const
        ).map((p) => (
          <div
            key={p.id}
            className="flex min-w-0 flex-col items-center gap-3"
          >
            <div
              className="overflow-hidden rounded-sm p-[2px]"
              style={{ background: p.color }}
            >
              <div className="overflow-hidden rounded-[1px] bg-[#111]">
                <PlayerHeadshot
                  playerId={p.id}
                  name={p.name}
                  size="xl"
                  className="!h-[148px] !w-[148px] !rounded-none !ring-0"
                  priority
                />
              </div>
            </div>
            <div className="w-full min-w-0 px-1 text-center">
              <p
                className="truncate text-[18px] font-black uppercase leading-tight tracking-[0.04em] sm:text-[20px]"
                title={lastName(p.name)}
              >
                {lastName(p.name)}
              </p>
              {p.season ? (
                <p className="mt-1.5 text-[11px] font-semibold uppercase tracking-[0.14em] text-white/55">
                  {p.season}
                </p>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 flex flex-col">
        {metrics.map((d, i) => {
          const aWin = sideWins(d, "a");
          const bWin = sideWins(d, "b");
          const aBar = Math.max(0, Math.min(100, d.aBar ?? 0));
          const bBar = Math.max(0, Math.min(100, d.bBar ?? 0));

          return (
            <div
              key={d.id}
              className={cn(
                SHARE_ROW_GRID,
                "py-3",
                i > 0 && "border-t border-white/15"
              )}
            >
              <div className="min-w-0">
                {layout === "bars" ? (
                  <div className="flex w-full flex-col items-end gap-1">
                    <span
                      className="w-full text-right text-[20px] font-bold tabular-nums leading-none"
                      style={{
                        color: aColor,
                        opacity: aWin || (!aWin && !bWin) ? 1 : 0.55,
                      }}
                    >
                      {d.aDisplay}
                    </span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="ml-auto h-full rounded-full"
                        style={{
                          width: `${aBar}%`,
                          background: aColor,
                          opacity: aWin || (!aWin && !bWin) ? 1 : 0.55,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <span
                    className="block w-full text-right text-[22px] font-bold tabular-nums leading-none"
                    style={{
                      color: aColor,
                      opacity: aWin || (!aWin && !bWin) ? 1 : 0.55,
                    }}
                  >
                    {d.aDisplay}
                  </span>
                )}
              </div>

              <div className="flex h-7 w-full items-center justify-center rounded-full border border-white/70 px-1.5">
                <span className="truncate text-[10px] font-bold uppercase tracking-[0.12em] text-white">
                  {d.label}
                </span>
              </div>

              <div className="min-w-0">
                {layout === "bars" ? (
                  <div className="flex w-full flex-col items-start gap-1">
                    <span
                      className="w-full text-left text-[20px] font-bold tabular-nums leading-none"
                      style={{
                        color: bColor,
                        opacity: bWin || (!aWin && !bWin) ? 1 : 0.55,
                      }}
                    >
                      {d.bDisplay}
                    </span>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full"
                        style={{
                          width: `${bBar}%`,
                          background: bColor,
                          opacity: bWin || (!aWin && !bWin) ? 1 : 0.55,
                        }}
                      />
                    </div>
                  </div>
                ) : (
                  <span
                    className="block w-full text-left text-[22px] font-bold tabular-nums leading-none"
                    style={{
                      color: bColor,
                      opacity: bWin || (!aWin && !bWin) ? 1 : 0.55,
                    }}
                  >
                    {d.bDisplay}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p className="mt-8 text-center text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
        DRBL
      </p>
    </div>
  );
}

export function CompareShareControls({
  result,
}: {
  result: PlayerComparisonResult;
}) {
  const titleId = useId();
  const graphicRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [layout, setLayout] = useState<ShareLayout>("clean");
  const [selectedIds, setSelectedIds] = useState<string[]>(() => {
    const available = new Set(result.dimensions.map((d) => d.id));
    const defaults = DEFAULT_SHARE_METRIC_IDS.filter((id) => available.has(id));
    return defaults.length ? defaults : result.dimensions.map((d) => d.id);
  });

  const pageUrl =
    typeof window !== "undefined"
      ? window.location.href
      : "https://drbl.app/compare";

  const selectedMetrics = useMemo(() => {
    const set = new Set(selectedIds);
    return result.dimensions.filter((d) => set.has(d.id));
  }, [result.dimensions, selectedIds]);

  useEffect(() => setMounted(true), []);

  // Reset metric picks when the matchup changes.
  useEffect(() => {
    const available = new Set(result.dimensions.map((d) => d.id));
    const defaults = DEFAULT_SHARE_METRIC_IDS.filter((id) => available.has(id));
    setSelectedIds(
      defaults.length ? [...defaults] : result.dimensions.map((d) => d.id)
    );
    setLayout("clean");
  }, [result.aId, result.bId, result.seasonA, result.seasonB]);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const runCapture = useCallback(async () => {
    const node = graphicRef.current;
    if (!node) throw new Error("Nothing to capture");
    if (!selectedMetrics.length) throw new Error("Pick at least one metric");
    setError(null);
    setBusy(true);
    // Preview may sit inside FitWidth scale; capture at 1× so the PNG stays crisp.
    const scaleWrap = node.parentElement;
    const prevTransform = scaleWrap?.style.transform ?? "";
    if (scaleWrap) {
      scaleWrap.style.transform = "none";
    }
    try {
      return await captureNode(node);
    } finally {
      if (scaleWrap) {
        scaleWrap.style.transform = prevTransform;
      }
      setBusy(false);
    }
  }, [selectedMetrics.length]);

  const openModal = useCallback(() => {
    setOpen(true);
    setError(null);
  }, []);

  const downloadPng = useCallback(async () => {
    try {
      const dataUrl = await runCapture();
      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = slugFileName(result);
      a.click();
    } catch {
      setError("Could not create image. Try again.");
    }
  }, [result, runCapture]);

  const shareNative = useCallback(async () => {
    try {
      const dataUrl = await runCapture();
      const file = dataUrlToFile(dataUrl, slugFileName(result));
      const text = compareShareText(result, pageUrl);
      if (navigator.share && navigator.canShare?.({ files: [file] })) {
        await navigator.share({
          files: [file],
          title: `${result.aName} vs ${result.bName}`,
          text,
        });
        return;
      }
      if (navigator.share) {
        await navigator.share({ title: "DRBL Compare", text, url: pageUrl });
        return;
      }
      await downloadPng();
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError("Share cancelled or unavailable.");
    }
  }, [downloadPng, pageUrl, result, runCapture]);

  const shareX = useCallback(async () => {
    const text = compareShareText(result, pageUrl);
    try {
      await downloadPng();
    } catch {
      /* still open tweet */
    }
    const intent = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(intent, "_blank", "noopener,noreferrer");
  }, [downloadPng, pageUrl, result]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(pageUrl);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setError("Could not copy link.");
    }
  }, [pageUrl]);

  const toggleMetric = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const selectAll = () => setSelectedIds(result.dimensions.map((d) => d.id));
  const selectDefaults = () => {
    const available = new Set(result.dimensions.map((d) => d.id));
    const defaults = DEFAULT_SHARE_METRIC_IDS.filter((id) => available.has(id));
    setSelectedIds(
      defaults.length ? [...defaults] : result.dimensions.map((d) => d.id)
    );
  };

  const modal =
    open && mounted
      ? createPortal(
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
              onClick={() => setOpen(false)}
            />
            <div
              className={cn(
                "relative z-[1] flex max-h-[min(92vh,100dvh)] w-full max-w-lg min-w-0 flex-col gap-4 overflow-x-clip overflow-y-auto",
                "rounded-t-[var(--radius-2xl)] border border-border/70 p-4 shadow-[var(--shadow-overlay)]",
                "frost-surface pb-[max(1rem,env(safe-area-inset-bottom))] sm:rounded-[var(--radius-2xl)] sm:p-5 sm:pb-5"
              )}
            >
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
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

              <SegmentedControl
                size="sm"
                label="Snapshot style"
                value={layout}
                onChange={setLayout}
                options={[
                  { id: "clean", label: "Raw values" },
                  { id: "bars", label: "With bars" },
                ]}
              />

              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between gap-2">
                  <p
                    className={cn(
                      type.micro,
                      "font-bold uppercase tracking-[0.12em] text-muted-foreground"
                    )}
                  >
                    Metrics on snapshot
                  </p>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={selectDefaults}
                      className={cn(
                        type.caption,
                        "font-semibold text-muted-foreground underline-offset-2 hover:underline"
                      )}
                    >
                      Defaults
                    </button>
                    <button
                      type="button"
                      onClick={selectAll}
                      className={cn(
                        type.caption,
                        "font-semibold text-muted-foreground underline-offset-2 hover:underline"
                      )}
                    >
                      All
                    </button>
                  </div>
                </div>
                <div className="max-h-36 overflow-y-auto rounded-[var(--radius-lg)] border border-border/60 frost-surface-soft p-2">
                  <ul className="grid grid-cols-2 gap-1 sm:grid-cols-3">
                    {result.dimensions.map((d) => {
                      const on = selectedIds.includes(d.id);
                      return (
                        <li key={d.id}>
                          <label
                            className={cn(
                              "flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5",
                              on ? "bg-foreground/8" : "hover:bg-foreground/5"
                            )}
                          >
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => toggleMetric(d.id)}
                              className="size-3.5 accent-foreground"
                            />
                            <span
                              className={cn(
                                type.caption,
                                "truncate font-semibold"
                              )}
                            >
                              {d.label}
                            </span>
                          </label>
                        </li>
                      );
                    })}
                  </ul>
                </div>
                {!selectedMetrics.length ? (
                  <p className={cn(type.caption, "text-destructive")}>
                    Select at least one metric.
                  </p>
                ) : null}
              </div>

              <div className="min-w-0 overflow-x-clip rounded-[var(--radius-xl)] border border-border/50 bg-black/50 p-2 sm:p-3">
                {selectedMetrics.length ? (
                  <div className="mx-auto max-h-[44vh] overflow-y-auto overflow-x-clip">
                    <FitWidth className="mx-auto w-full min-w-0">
                      <div ref={graphicRef}>
                        <CompareShareGraphic
                          result={result}
                          metrics={selectedMetrics}
                          layout={layout}
                        />
                      </div>
                    </FitWidth>
                  </div>
                ) : (
                  <div className="flex h-40 flex-col items-center justify-center gap-1 text-center">
                    <p className={cn(type.bodySm, "font-semibold text-white")}>
                      {result.aName} vs {result.bName}
                    </p>
                    <p className={cn(type.caption, "text-white/60")}>
                      Pick metrics to preview the snapshot
                    </p>
                  </div>
                )}
              </div>

              <div className="flex justify-center gap-1 touch-scroll-x pb-1 pt-1">
                <ShareAction
                  label={copied ? "Copied" : "Copy link"}
                  icon={
                    copied ? (
                      <Check className="size-5" />
                    ) : (
                      <Link2 className="size-5" />
                    )
                  }
                  onClick={() => void copyLink()}
                />
                <ShareAction
                  label="Download"
                  icon={<Download className="size-5" />}
                  disabled={busy || !selectedMetrics.length}
                  onClick={() => void downloadPng()}
                />
                <ShareAction
                  label="Share…"
                  icon={<Share2 className="size-5" />}
                  disabled={busy || !selectedMetrics.length}
                  onClick={() => void shareNative()}
                />
                <ShareAction
                  label="Post to X"
                  icon={
                    <span className="text-[13px] font-bold leading-none">X</span>
                  }
                  disabled={busy || !selectedMetrics.length}
                  onClick={() => void shareX()}
                />
                <ShareAction
                  label="Copy text"
                  icon={<Copy className="size-5" />}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(compareShareText(result, pageUrl))
                      .then(() => {
                        setCopied(true);
                        window.setTimeout(() => setCopied(false), 2000);
                      });
                  }}
                />
              </div>

              {error ? (
                <p className={cn(type.caption, "text-center text-destructive")}>
                  {error}
                </p>
              ) : null}
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <div
      className="relative flex flex-wrap items-center justify-end gap-2"
      data-capture-exclude=""
    >
      <button
        type="button"
        onClick={() => openModal()}
        disabled={busy && open}
        className={cn(
          "glass-pill inline-flex h-9 items-center gap-2 rounded-md px-3 font-semibold",
          type.bodySm,
          busy && open && "opacity-60"
        )}
      >
        <Share2 className="size-3.5" aria-hidden />
        Share snapshot
      </button>
      {modal}
    </div>
  );
}
