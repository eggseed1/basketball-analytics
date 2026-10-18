"use client";

import { hofSpeech } from "@/one-shot/ceremony";
import { isCeremony } from "@/one-shot/engine";
import type { LifeState } from "@/one-shot/types";

const BITS = Array.from({ length: 56 }, (_, i) => ({
  left: (i * 17) % 100,
  delay: (i % 14) * 0.12,
  duration: 2.6 + (i % 5) * 0.4,
  color: ["#0071e3", "#1f8a3b", "#f2c14e", "#d6245f", "#f4f4f4", "#ffa726"][i % 6]!,
  spin: (i * 47) % 360,
  size: 6 + (i % 4) * 2,
}));

/** Full-screen pause for a title, an MVP, a gold medal, or the Hall of Fame speech. */
export function CeremonyOverlay({
  life,
  reducedMotion,
  onClose,
}: {
  life: LifeState;
  reducedMotion: boolean;
  onClose: () => void;
}) {
  const d = life.pendingDecision;
  if (!d || !isCeremony(d.templateId)) return null;
  const hall = d.templateId === "hof";
  const lines = (hall ? hofSpeech(life) : d.body).split(/(?<=\.)\s+/).filter(Boolean);
  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-labelledby="os-ceremony-title">
      <div className="absolute inset-0 bg-black/55" />
      {reducedMotion ? null : (
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          {BITS.map((b, i) => (
            <span
              key={i}
              className="os-confetti-bit absolute top-0 rounded-[1px]"
              style={{
                left: `${b.left}%`,
                width: b.size,
                height: b.size * 1.6,
                background: b.color,
                animationDelay: `${b.delay}s`,
                animationDuration: `${b.duration}s`,
                ["--os-spin" as string]: `${b.spin}deg`,
              }}
            />
          ))}
        </div>
      )}
      <div className={`relative z-[1] max-h-[min(86vh,720px)] w-full max-w-lg overflow-y-auto rounded-[16px] border border-[var(--os-amber)] bg-[var(--os-panel)] px-5 py-5 shadow-2xl ${reducedMotion ? "" : "animate-in fade-in zoom-in-95 duration-300"}`}>
        <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--os-amber)]">{hall ? "Hall of Fame" : "A night you keep"}</p>
        <h2 id="os-ceremony-title" className="mt-1 text-[22px] font-semibold leading-tight">
          {d.title}
        </h2>
        <div className="mt-3 flex flex-col gap-2 text-[14px] leading-relaxed text-[var(--os-text)]/90">
          {lines.map((line) => (
            <p key={line}>{line}</p>
          ))}
        </div>
        <button
          type="button"
          autoFocus
          onClick={onClose}
          className="mt-5 min-h-10 w-full rounded-lg bg-[var(--os-amber)] px-3 text-[14px] font-semibold text-black focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]"
        >
          {d.choices[0]?.label ?? "Take it in"}
        </button>
      </div>
    </div>
  );
}
