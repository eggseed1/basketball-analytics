"use client";

import { useEffect } from "react";
import { GmPlayerPortrait } from "@/gm/ui/gm-player-portrait";
import { ClubMark } from "@/gm/ui/club-mark";
import { teamColorStyle } from "@/gm/ui/team-colors";
import type { GmPlayer } from "@/gm/types";

/** A fictional, locally rendered signing moment. It does not imply an
 * authentic real-player autograph; the decorative signature is game art. */
export function GmContractSigningCelebration({
  player, teamId, teamName, salaryM, years, extension, onClose,
}: {
  player: GmPlayer; teamId: string; teamName: string;
  salaryM: number; years: number; extension: boolean; onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return <div role="dialog" aria-modal="true" aria-label="Contract signed"
    data-testid="gm-contract-signed" className="gm-sign-celebration fixed inset-0 z-[80] flex items-center justify-center overflow-hidden bg-black/75 p-4"
    style={teamColorStyle(teamId)}>
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      {Array.from({ length: 66 }, (_, index) => (
        <span key={index} className="gm-sign-confetti absolute -top-8 block rounded-[2px]"
          style={{
            left: ((index * 47 + 13) % 99) + "%",
            width: index % 4 === 0 ? 7 : 5,
            height: index % 5 === 0 ? 19 : 12,
            background: index % 3 === 0 ? "var(--team-secondary)" : "var(--team-primary)",
            animationDelay: ((index * 73) % 950) + "ms",
            animationDuration: (1800 + (index * 131) % 1450) + "ms",
            ["--sway" as string]: ((index * 37) % 180 - 90) + "px",
          }} />
      ))}
    </div>
    <div className="gm-sign-card relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border-2 border-[var(--team-primary)] bg-card text-foreground shadow-2xl">
      <div className="h-2 bg-[var(--team-primary)]" />
      <div className="px-6 pb-6 pt-7 sm:px-9">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Franchise Lab · Official agreement</p>
          <ClubMark teamId={teamId} label={teamName} />
        </div>
        <div className="mt-6 flex items-center gap-4">
          <GmPlayerPortrait player={player} size="xl" />
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-[var(--team-primary)]">{extension ? "Extension signed" : "New signing"}</p>
            <h2 className="mt-1 text-2xl font-black tracking-tight sm:text-3xl">{player.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">Welcome to the next chapter.</p>
          </div>
        </div>
        <div className="mt-6 rounded-xl border border-border bg-background/70 px-5 py-5">
          <p className="text-[10px] font-bold uppercase tracking-[0.17em] text-muted-foreground">Player contract · {teamName}</p>
          <div className="mt-4 flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Term</span><span className="font-bold">{years} year{years === 1 ? "" : "s"}</span>
          </div>
          <div className="mt-2 flex justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Annual salary</span><span className="font-bold">${salaryM.toFixed(2)}M</span>
          </div>
          <div className="mt-2 flex justify-between gap-3 border-b border-border pb-4 text-sm">
            <span className="text-muted-foreground">Total value</span><span className="font-bold">${(salaryM * years).toFixed(2)}M</span>
          </div>
          <div className="relative mt-5 h-20 border-b border-muted-foreground/50">
            <span aria-label={player.name + " fictional signature"}
              className="gm-sign-ink absolute bottom-2 left-2 max-w-full overflow-hidden whitespace-nowrap text-[31px] italic leading-tight text-foreground sm:text-[39px]"
              style={{ fontFamily: '"Brush Script MT", "Segoe Script", "Apple Chancery", cursive' }}>
              {player.name}
            </span>
            <svg aria-hidden="true" viewBox="0 0 340 30" className="gm-sign-flourish absolute bottom-0 left-1 h-7 w-[85%] max-w-[340px]" fill="none">
              <path d="M3 23 C62 10 75 26 124 17 S201 13 244 17 S290 25 333 6" stroke="var(--team-primary)" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="400" strokeDashoffset="400" />
            </svg>
          </div>
          <p className="mt-2 text-[10px] text-muted-foreground">Stylized in-game signature · not an authentic autograph</p>
        </div>
        <button type="button" autoFocus onClick={onClose}
          className="mt-6 w-full rounded-lg bg-[var(--team-primary)] px-5 py-3 text-sm font-bold text-white transition-opacity hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--team-secondary)]">
          Continue franchise
        </button>
      </div>
    </div>
    <style>{`
      @keyframes gm-confetti-fall { from { transform: translate3d(0, -22px, 0) rotate(0); opacity: 1; } to { transform: translate3d(var(--sway), 108vh, 0) rotate(780deg); opacity: 0; } }
      @keyframes gm-contract-appear { from { opacity: 0; transform: translateY(22px) scale(.93); } to { opacity: 1; transform: translateY(0) scale(1); } }
      @keyframes gm-sign-write { 0%, 15% { clip-path: inset(0 100% 0 0); } 100% { clip-path: inset(0 0 0 0); } }
      @keyframes gm-pen-line { 0%, 25% { stroke-dashoffset: 400; } 100% { stroke-dashoffset: 0; } }
      .gm-sign-confetti { animation-name: gm-confetti-fall; animation-timing-function: cubic-bezier(.27,.48,.51,.92); animation-fill-mode: both; }
      .gm-sign-card { animation: gm-contract-appear 530ms cubic-bezier(.16,1,.3,1) both; }
      .gm-sign-ink { animation: gm-sign-write 1250ms ease-out 330ms both; }
      .gm-sign-flourish path { animation: gm-pen-line 1200ms ease-out 450ms forwards; }
      @media (prefers-reduced-motion: reduce) {
        .gm-sign-confetti { animation: none; display: none; }
        .gm-sign-card, .gm-sign-ink, .gm-sign-flourish path { animation: none; clip-path: none; stroke-dashoffset: 0; }
      }
    `}</style>
  </div>;
}
