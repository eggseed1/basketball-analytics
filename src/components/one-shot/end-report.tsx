"use client";

import { useEffect, useRef, useState } from "react";

import { careerArc } from "@/one-shot/arcs";
import { fmtHeight } from "@/one-shot/body";
import { perGame } from "@/one-shot/career";
import { challengeStatusLine } from "@/one-shot/challenges";
import { invested, netWorth } from "@/one-shot/finance";
import { earningsRank, MAX_ALL_TIME, MAX_BOARD, ordinal, rowRank, type EarningsRow } from "@/one-shot/leaderboard";
import { peerCompareLines } from "@/one-shot/peers";
import { careerBadges } from "@/one-shot/badges";
import { awardCount, dailyGhostLines, honorsLine, medalCount, nbaHonorList, outcomeTier, shareText, TIER_LABEL, type CareerSummary } from "@/one-shot/report";
import type { LifeState } from "@/one-shot/types";
import { country, countryFlag } from "@/one-shot/world";

import { EarningsPanel, LetterBoxes, type AllTimeStatus } from "./earnings-board";
import { Portrait } from "./panels-left";
import { SeasonTable } from "./stats-panel";
import { shareCardPng, type SharePoster } from "./pixel";
import { Btn, Chip, Kv, money, Panel } from "./ui";

export function EndReport({
  life,
  units,
  careers,
  board,
  allTime,
  allTimeStatus,
  highlightBoardId,
  onStamp,
  onNew,
  onHome,
}: {
  life: LifeState;
  units: "metric" | "imperial";
  careers: CareerSummary[];
  board: CareerSummary[];
  allTime: EarningsRow[];
  allTimeStatus: AllTimeStatus;
  highlightBoardId?: string | null;
  onStamp?: (id: { runId?: string; boardId?: string }, tag: string) => void;
  onNew: () => void;
  onHome: () => void;
}) {
  const [note, setNote] = useState<string | null>(null);
  const [cardUrl, setCardUrl] = useState<string | null>(null);
  const cardBlob = useRef<Blob | null>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  const tier = outcomeTier(life);
  const arc = careerArc(life);
  const challengeLine = challengeStatusLine(life);
  const peerLines = peerCompareLines(
    life.peers,
    life.achievements.nbaDebut !== null,
    Boolean(life.achievements.drafted),
    life.achievements.drafted?.pick ?? null,
  );
  const born = country(life.birthplace.countryId);
  const origin = typeof window === "undefined" ? "https://drbl.io" : window.location.origin;
  const text = shareText(life, origin);
  const link = text.split("\n").at(-1)!;
  const route = [...new Set(life.seasons.filter((s) => s.ageYears >= 12).map((s) => s.levelLabel))];
  const best = [...life.seasons].filter((s) => s.gp >= 5).sort((a, b) => b.strength - a.strength || perGame(b, "pts") - perGame(a, "pts"))[0];
  const medals = medalCount(life);
  const medalLabel = (["gold", "silver", "bronze"] as const)
    .filter((k) => medals[k])
    .map((k) => `${medals[k]} ${k}`)
    .join(", ");
  const awards = awardCount(life);
  const nbaHonors = nbaHonorList(life);
  const coachW = life.after?.years.reduce((a, y) => a + (y.wins ?? 0), 0) ?? 0;
  const coachL = life.after?.years.reduce((a, y) => a + (y.losses ?? 0), 0) ?? 0;
  const honors = honorsLine(life);
  const place = earningsRank(board, life.runId);
  const onDevice = place ? `${ordinal(place.rank)} of ${place.of} on this device` : `Outside the top ${MAX_BOARD} on this device`;
  const shared = highlightBoardId ? rowRank(allTime, highlightBoardId) : null;
  const allTimeLabel =
    allTimeStatus === "loading"
      ? "Checking"
      : allTimeStatus === "down"
        ? "Not reachable"
        : shared
          ? `${ordinal(shared.rank)} of ${shared.of}`
          : `Outside the top ${MAX_ALL_TIME}`;
  const ghosts = dailyGhostLines(careers, life);
  const badges = careerBadges(life);
  const moments = life.history
    .filter((h) => h.kind === "milestone" || h.kind === "draft" || h.kind === "move" || (h.kind === "injury" && h.tone === "bad"))
    .slice(-10);
  const mine = board.find((c) => c.runId === life.runId) ?? careers.find((c) => c.runId === life.runId) ?? null;
  const myTag = mine?.tag ?? null;
  const poster: SharePoster = {
    tier: arc.title,
    born: `Born in ${life.birthplace.locality}, ${born.name}`,
    team: life.after?.employer ?? life.placement.teamName,
    route: route.slice(-6),
    link,
    height: fmtHeight(life.body.heightCm, units),
    seasons: String(life.seasons.length),
    peak: best ? `${perGame(best, "pts").toFixed(1)} PPG` : null,
    draft: life.achievements.drafted ? `R${life.achievements.drafted.round} P${life.achievements.drafted.pick}` : life.nbaGames > 0 ? "Undrafted" : null,
    nbaGames: life.nbaGames,
    earnings: life.earnings > 0 ? money(life.earnings) : null,
    honors,
    ended: `Age ${Math.floor(life.ageMonths / 12)}`,
  };
  const fileName = `one-shot-${life.identity.displayName.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.png`;
  useEffect(() => {
    let dead = false;
    let url: string | null = null;
    cardBlob.current = null;
    setCardUrl(null);
    void shareCardPng(life, poster).then((blob) => {
      if (dead) return;
      if (!blob) {
        setNote("Could not draw the card in this browser.");
        return;
      }
      cardBlob.current = blob;
      url = URL.createObjectURL(blob);
      setCardUrl(url);
    });
    return () => {
      dead = true;
      if (url) URL.revokeObjectURL(url);
    };
    // Poster fields are derived from this life and the unit toggle.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [life, units, link]);
  const copy = async (value: string, done: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setNote(done);
    } catch {
      setNote("Copy failed. Your browser blocked clipboard access.");
    }
  };
  const blobNow = () => cardBlob.current;
  const saveImage = () => {
    const blob = blobNow();
    if (!blob) return setNote("Could not draw the card in this browser.");
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = fileName;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setNote("Image saved.");
  };
  const copyImage = async (blob: Blob) => {
    if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") return false;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
      return true;
    } catch {
      return false;
    }
  };
  const shareImage = async () => {
    const blob = blobNow();
    if (!blob) return setNote("Could not draw the card in this browser.");
    const file = new File([blob], fileName, { type: "image/png" });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: `${life.identity.displayName} · ONE SHOT`, text });
        setNote("Shared.");
        return;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
      }
    }
    if (await copyImage(blob)) {
      setNote("Image copied. Paste it into a chat.");
      return;
    }
    saveImage();
  };
  return (
    <div className="mx-auto flex w-full max-w-[1100px] flex-col gap-5">
      <Panel title="Career card">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
          <div className="w-full max-w-[280px] shrink-0">
            {cardUrl ? (
              <img src={cardUrl} alt={`${life.identity.displayName}, ONE SHOT career card`} className="w-full rounded-[14px] border border-[var(--os-border)]" />
            ) : (
              <div className="flex aspect-[4/5] items-center justify-center rounded-[14px] border border-[var(--os-border)] text-[13px] text-[var(--os-dim)]">Drawing the card.</div>
            )}
          </div>
          <div className="min-w-0">
            <p className="max-w-[42ch] text-[14px] leading-snug">The image has the portrait, the route, and a replay link. Share it from here, or save it and post it yourself.</p>
            <div className="mt-4 flex flex-wrap gap-2">
              <Btn variant="primary" onClick={() => void shareImage()} disabled={!cardUrl}>
                Share image
              </Btn>
              <Btn onClick={saveImage} disabled={!cardUrl}>
                Save image
              </Btn>
              <Btn onClick={() => copy(text, "Caption copied.")}>Copy caption</Btn>
              <Btn onClick={() => copy(link, "Replay link copied.")}>Copy replay link</Btn>
            </div>
            <p className="mt-2 min-h-[1.2em] text-[12px] text-[var(--os-green)]" role="status" aria-live="polite">
              {note}
            </p>
          </div>
        </div>
      </Panel>
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <Panel className="p-5 sm:p-6">
        <p className="text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--os-dim)]">End report</p>
        <div className="mt-3 flex items-start gap-4">
          <Portrait life={life} size={96} className="shrink-0 rounded-[11px] border border-[var(--os-border)]" />
          <div className="min-w-0">
            <h2 ref={heading} tabIndex={-1} className="text-[24px] font-semibold leading-tight focus:outline-none">
              {life.identity.displayName}
            </h2>
            <p className="mt-1 text-[13px] text-[var(--os-dim)]">
              {countryFlag(born.id)} Born in {life.birthplace.locality}, {born.name}
            </p>
            <p className="mt-2 flex flex-wrap gap-1.5">
              <Chip tone={arc.proud ? "green" : tier === "drafted" || tier === "top-pro" ? "teal" : "amber"}>{arc.title}</Chip>
              {arc.title !== TIER_LABEL[tier] ? <Chip tone="dim">{TIER_LABEL[tier]}</Chip> : null}
            </p>
            {arc.line ? <p className="mt-2 max-w-[46ch] text-[13px] text-[var(--os-dim)]">{arc.line}</p> : null}
          </div>
            {badges.length ? (
              <p className="mt-2 flex flex-wrap gap-1.5">
                {badges.map((b) => (
                  <Chip key={b.id} tone="teal">
                    {b.label}
                  </Chip>
                ))}
              </p>
            ) : null}
        </div>
        <dl className="mt-4">
          <Kv k="NBA debut" v={life.achievements.nbaDebut !== null ? `Age ${Math.floor(life.achievements.nbaDebut / 12)}` : "No"} />
          <Kv k="Draft" v={life.achievements.drafted ? `Round ${life.achievements.drafted.round}, pick ${life.achievements.drafted.pick}` : "Undrafted"} />
          {life.nbaGames > 0 ? <Kv k="NBA games" v={life.nbaGames} mono /> : null}
          <Kv k="Height" v={fmtHeight(life.body.heightCm, units)} mono />
          <Kv k="Seasons played" v={life.seasons.length} mono />
          {best ? <Kv k="Best season" v={`${best.levelLabel}, age ${best.ageYears}: ${perGame(best, "pts").toFixed(1)} pts`} /> : null}
          {life.international.caps > 0 ? <Kv k="National team" v={`${life.international.caps} caps${medalLabel ? ` · ${medalLabel}` : ""}`} mono /> : null}
          {nbaHonors ? <Kv k="NBA honors" v={nbaHonors} /> : null}
            {ghosts.length ? (
              <ul className="mt-2 max-w-[48ch] text-[12.5px] text-[var(--os-dim)]">
                {ghosts.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            ) : null}
          {awards ? <Kv k="Season honors" v={awards} mono /> : null}
          <Kv k="Career earnings, pre-tax" v={life.earnings > 0 ? money(life.earnings) : "None"} mono />
          <Kv k="On this device" v={onDevice} />
          <Kv k="All-time" v={allTimeLabel} />
          {challengeLine ? <Kv k="Challenge" v={challengeLine} /> : null}
          {life.after ? <Kv k="After playing" v={`${life.after.title}, ${life.after.employer}`} /> : null}
          {coachW + coachL > 0 ? <Kv k="Coaching record" v={`${coachW}-${coachL}`} mono /> : null}
          {life.earnings > 0 || invested(life.finance) > 0 ? <Kv k="Net worth at the end" v={money(netWorth(life.finance))} mono /> : null}
          <Kv
            k="Life ended"
            v={
              life.ended?.reason === "chapter"
                ? "Chapter finished"
                : life.ended?.reason === "retired"
                  ? `Retired at ${Math.floor(life.ageMonths / 12)}`
                  : `Out of basketball at ${Math.floor(life.ageMonths / 12)}`
            }
          />
        </dl>
        {route.length ? <p className="mt-3 text-[12.5px] text-[var(--os-dim)]">Route: {route.join(" → ")}</p> : null}
        {onStamp ? (
          <div className="mt-5 border-t border-[var(--os-border)] pt-4">
            {myTag ? (
              <p className="text-[13px]">
                On the all-time board as <span className="font-mono text-[15px] font-semibold tracking-[0.12em] text-[var(--os-amber)]">{myTag}</span>.
              </p>
            ) : (
              <>
                <p className="text-[13px] font-medium">Leave three initials on the all-time board</p>
                <p className="mt-1 text-[12.5px] text-[var(--os-dim)]">Arcade-style. They sit next to this score wherever the board is shown.</p>
                <LetterBoxes
                  onEnter={(tag) =>
                    onStamp({ runId: life.runId, boardId: highlightBoardId ?? mine?.boardId ?? undefined }, tag)
                  }
                />
              </>
            )}
          </div>
        ) : null}
        <div className="mt-5 flex flex-wrap gap-2 border-t border-[var(--os-border)] pt-4">
          <Btn variant="primary" onClick={onNew}>
            New life
          </Btn>
          <Btn variant="quiet" onClick={onHome}>
            Back to start
          </Btn>
        </div>
      </Panel>
      <div className="flex min-w-0 flex-col gap-5">
        <Panel title="Earnings">
          <EarningsPanel
            personal={board}
            allTime={allTime}
            allTimeStatus={allTimeStatus}
            highlightRunId={life.runId}
            highlightBoardId={highlightBoardId}
            units={units}
            onStamp={onStamp}
            defaultWhich="all"
          />
        </Panel>
        <Panel title="Key moments">
          <ol className="flex flex-col">
            {moments.map((h) => (
              <li key={h.id} className="grid grid-cols-[40px_1fr] gap-2 border-b border-[var(--os-border)]/50 py-1.5 text-[12.5px] last:border-b-0">
                <span className="font-mono text-[11px] text-[var(--os-dim)]">{Math.floor(h.month / 12)}</span>
                <span>{h.text}</span>
              </li>
            ))}
            {moments.length === 0 ? <li className="text-[12.5px] text-[var(--os-dim)]">A quiet life.</li> : null}
          </ol>
        </Panel>
        <Panel title="Seasons">
          <SeasonTable life={life} />
        </Panel>
        <Panel title="Same generation">
          {peerLines.length ? (
            <ul className="mb-2 flex flex-col gap-1">
              {peerLines.map((line) => (
                <li key={line} className="text-[12.5px] text-[var(--os-dim)]">
                  {line}
                </li>
              ))}
            </ul>
          ) : null}
          <ul className="flex flex-col">
            {life.peers.map((p) => (
              <li key={p.id} className="flex justify-between gap-2 border-b border-[var(--os-border)]/50 py-1.5 text-[12.5px] last:border-b-0">
                <span className="truncate">
                  {countryFlag(p.countryId)} {p.name}
                  {p.rival ? " · rival" : ""}
                </span>
                <span className="shrink-0 text-[var(--os-dim)]">{p.status}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
      </div>
    </div>
  );
}
