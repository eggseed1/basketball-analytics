"use client";

import { useMemo, useState, type ReactNode } from "react";

import { calendar, MONTHS, perGame, performanceLevel, ROLE_LABEL } from "@/one-shot/career";
import { KIND_LABEL, nationalTeam, upcoming } from "@/one-shot/international";
import { advanced, EMPTY_LINE, gameScoreTotal, num, pct, sumBoxes, type StatLine } from "@/one-shot/stats";
import type { BoxScore, LifeState } from "@/one-shot/types";
import { country, countryFlag } from "@/one-shot/world";

import { Chip, OS, Panel, Segmented } from "./ui";

function Short({ short, full }: { short: string; full: string }) {
  return (
    <>
      <span aria-hidden className="sm:hidden">
        {short}
      </span>
      <span className="sr-only sm:not-sr-only">{full}</span>
    </>
  );
}

type Tab = "seasons" | "advanced" | "games" | "splits" | "national";

const allSeasons = (life: LifeState) => [...life.seasons, ...(life.season && life.season.gp > 0 ? [life.season] : [])];

export function StatsPanel({ life }: { life: LifeState }) {
  const [tab, setTab] = useState<Tab>("seasons");
  const hasIntl = life.international.tournaments.length > 0 || (nationalTeam(life) !== null && life.ageMonths >= 13 * 12);
  return (
    <Panel id="os-stats" title="Stats">
      <div className="-mt-1 mb-2 overflow-x-auto">
        <Segmented<Tab>
          label="Stats view"
          value={tab}
          onChange={setTab}
          className="min-w-max"
          options={[
            { value: "seasons", label: "Seasons" },
            { value: "advanced", label: <Short short="Adv." full="Advanced" /> },
            { value: "games", label: "Games" },
            { value: "splits", label: "Splits" },
            {
              value: "national",
              label: <Short short="Intl" full="Country" />,
              disabled: !hasIntl,
              hint: hasIntl ? undefined : "National teams start picking players at 14.",
            },
          ]}
        />
      </div>
      {tab === "seasons" ? <SeasonTable life={life} /> : null}
      {tab === "advanced" ? <AdvancedTable life={life} /> : null}
      {tab === "games" ? <GameLog life={life} /> : null}
      {tab === "splits" ? <Splits life={life} /> : null}
      {tab === "national" ? <National life={life} /> : null}
    </Panel>
  );
}

function Table({ head, children, minW = 560, note }: { head: ReactNode[]; children: ReactNode; minW?: number; note?: ReactNode }) {
  return (
    <div className="max-h-[340px] overflow-auto">
      <table className="w-full border-collapse whitespace-nowrap font-mono text-[11.5px] tabular-nums" style={{ minWidth: minW }}>
        <thead className="sticky top-0 bg-[var(--os-panel)] text-[var(--os-dim)]">
          <tr className="text-right [&>th]:px-1.5 [&>th]:py-1 [&>th]:font-normal [&>th:first-child]:text-left [&>th:nth-child(2)]:text-left">
            {head.map((h, i) => (
              <th key={i}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
      {note ? <p className="mt-2 font-sans text-[11px] text-[var(--os-dim)]">{note}</p> : null}
    </div>
  );
}

const rowCls = "border-t border-[var(--os-border)]/50 text-right [&>td]:px-1.5 [&>td]:py-1";
const shot = (m: number, a: number) => (a ? `${((m / a) * 100).toFixed(0)}` : "—");

export function SeasonTable({ life }: { life: LifeState }) {
  const rows = allSeasons(life).slice().reverse();
  if (!rows.length) return <p className="text-[12.5px] text-[var(--os-dim)]">No organized seasons yet.</p>;
  return (
    <Table
      head={["Age", "Level", "Role", "GP", "MIN", "PTS", "REB", "AST", "STL", "BLK", "FG%", "3P%", "FT%", "W-L"]}
      minW={680}
      note="A blank percentage means no attempts, not 0%. ★ marks season honors (model thresholds)."
    >
      {rows.map((r, i) => (
        <tr key={`${r.key}-${i}`} className={rowCls}>
          <td className="text-left">{r.ageYears}</td>
          <td className="max-w-[200px] truncate text-left font-sans" title={`${r.levelLabel}${r.teamName ? ` · ${r.teamName}` : ""}${r.awards?.length ? ` · ${r.awards.join(", ")}` : ""}`}>
            {r.awards?.length ? <span style={{ color: OS.amber }}>{"★".repeat(Math.min(3, r.awards.length))} </span> : null}
            {r.levelLabel}
          </td>
          <td className="text-left font-sans text-[var(--os-dim)]">{ROLE_LABEL[r.role]}</td>
          <td>{r.gp}</td>
          <td>{perGame(r, "min").toFixed(1)}</td>
          <td>{perGame(r, "pts").toFixed(1)}</td>
          <td>{perGame(r, "reb").toFixed(1)}</td>
          <td>{perGame(r, "ast").toFixed(1)}</td>
          <td>{perGame(r, "stl").toFixed(1)}</td>
          <td>{perGame(r, "blk").toFixed(1)}</td>
          <td>{shot(r.fgm, r.fga)}</td>
          <td>{shot(r.tpm, r.tpa)}</td>
          <td>{shot(r.ftm, r.fta)}</td>
          <td>
            {r.wins}-{r.losses}
          </td>
        </tr>
      ))}
    </Table>
  );
}

const ADV_NOTE =
  "TS% counts free throws and threes. eFG% weights threes by 1.5. Rates per 36 minutes. Game Score is simplified: rebounds count 0.4 each and fouls aren't simulated. A dash means no attempts or minutes, not 0.";

function advCells(l: StatLine) {
  const a = advanced(l);
  return [pct(a.ts), pct(a.efg), pct(a.tpar, 0), pct(a.ftr, 0), num(a.astTov), num(a.pts36), num(a.reb36), num(a.ast36), num(a.stocks36), num(a.gmsc)];
}

function AdvancedTable({ life }: { life: LifeState }) {
  const rows = allSeasons(life)
    .filter((r) => r.gp > 0)
    .reverse();
  if (!rows.length) return <p className="text-[12.5px] text-[var(--os-dim)]">Advanced numbers start with the first organized game.</p>;
  const sumKeys = Object.keys(EMPTY_LINE) as (keyof StatLine)[];
  const career = rows.reduce<StatLine>((a, r) => Object.fromEntries(sumKeys.map((k) => [k, a[k] + r[k]])) as StatLine, EMPTY_LINE);
  return (
    <Table head={["Age", "Level", "TS%", "eFG%", "3PAr", "FTr", "AST/TO", "PTS/36", "REB/36", "AST/36", "STK/36", "GmSc"]} minW={720} note={ADV_NOTE}>
      {rows.map((r, i) => (
        <tr key={`${r.key}-${i}`} className={rowCls}>
          <td className="text-left">{r.ageYears}</td>
          <td className="max-w-[180px] truncate text-left font-sans" title={r.levelLabel}>
            {r.levelLabel}
          </td>
          {advCells(r).map((v, i) => (
            <td key={i}>{v}</td>
          ))}
        </tr>
      ))}
      <tr className={`${rowCls} font-semibold`}>
        <td className="text-left">All</td>
        <td className="text-left font-sans">Career</td>
        {advCells(career).map((v, i) => (
          <td key={i}>{v}</td>
        ))}
      </tr>
    </Table>
  );
}

function seasonLabels(life: LifeState) {
  const m = new Map<string, string>();
  for (const s of allSeasons(life)) m.set(s.key, `${s.levelLabel}, ${s.calendarYear}`);
  if (life.season) m.set(life.season.key, `${life.season.levelLabel}, ${life.season.calendarYear}`);
  for (const t of life.international.tournaments) m.set(`intl:${t.id}`, t.name);
  return m;
}

function useSeasonPick(life: LifeState) {
  const keys = useMemo(() => [...new Set(life.gameLog.map((b) => b.seasonKey ?? "?"))].reverse(), [life.gameLog]);
  const [picked, setPicked] = useState<string | null>(null);
  const key = picked && keys.includes(picked) ? picked : (keys[0] ?? null);
  return { keys, key, setPicked };
}

function SeasonSelect({ life, keys, value, onChange }: { life: LifeState; keys: string[]; value: string; onChange: (k: string) => void }) {
  const labels = seasonLabels(life);
  return (
    <label className="mb-2 flex items-center gap-2 text-[12px] text-[var(--os-dim)]">
      Season
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="min-h-8 min-w-0 flex-1 rounded-[4px] border border-[var(--os-border)] bg-[var(--os-page)] px-2 text-[12.5px] text-[var(--os-text)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--os-teal)]"
      >
        {keys.map((k) => (
          <option key={k} value={k}>
            {labels.get(k) ?? "Earlier games"}
          </option>
        ))}
      </select>
    </label>
  );
}

function GameLog({ life }: { life: LifeState }) {
  const { keys, key, setPicked } = useSeasonPick(life);
  if (!key) return <p className="text-[12.5px] text-[var(--os-dim)]">No games logged yet. The log keeps the most recent 160 games.</p>;
  const games = life.gameLog
    .filter((b) => (b.seasonKey ?? "?") === key)
    .slice()
    .reverse();
  return (
    <>
      <SeasonSelect life={life} keys={keys} value={key} onChange={setPicked} />
      <Table
        head={["Date", "Opponent", "Result", "MIN", "PTS", "REB", "AST", "STL", "BLK", "TO", "FG", "3P", "FT", "GmSc"]}
        minW={720}
        note="DNP means he was out injured. The log keeps the most recent 160 games."
      >
        {games.map((b, i) => {
          const { month, year } = calendar(life, b.month);
          const won = b.teamScore > b.oppScore;
          return (
            <tr key={`${b.month}-${i}`} className={rowCls}>
              <td className="text-left">
                {MONTHS[month - 1]} {String(year).slice(2)}
              </td>
              <td className="max-w-[140px] truncate text-left font-sans">{b.opponent}</td>
              <td style={{ color: won ? OS.green : OS.rose }}>
                {won ? "W" : "L"} {b.teamScore}-{b.oppScore}
              </td>
              {b.min > 0 ? (
                <>
                  <td>{b.min}</td>
                  <td>{b.pts}</td>
                  <td>{b.reb}</td>
                  <td>{b.ast}</td>
                  <td>{b.stl}</td>
                  <td>{b.blk}</td>
                  <td>{b.tov}</td>
                  <td>
                    {b.fgm}-{b.fga}
                  </td>
                  <td>
                    {b.tpm}-{b.tpa}
                  </td>
                  <td>
                    {b.ftm}-{b.fta}
                  </td>
                  <td>{gameScoreTotal(b).toFixed(1)}</td>
                </>
              ) : (
                <td colSpan={11} className="text-center font-sans text-[var(--os-dim)]">
                  DNP
                </td>
              )}
            </tr>
          );
        })}
      </Table>
    </>
  );
}

function splitRow(label: string, boxes: BoxScore[]) {
  const l = sumBoxes(boxes);
  const a = advanced(l);
  const g = Math.max(1, l.gp);
  return {
    label,
    l,
    cells: [l.gp, num(l.gp ? l.min / g : null), num(l.gp ? l.pts / g : null), num(l.gp ? l.reb / g : null), num(l.gp ? l.ast / g : null), pct(a.ts), num(a.gmsc), `${l.wins}-${l.losses}`],
  };
}

function Splits({ life }: { life: LifeState }) {
  const { keys, key, setPicked } = useSeasonPick(life);
  if (!key) return <p className="text-[12.5px] text-[var(--os-dim)]">Splits appear once he plays organized games.</p>;
  const games = life.gameLog.filter((b) => (b.seasonKey ?? "?") === key);
  const byMonth = new Map<string, BoxScore[]>();
  for (const b of games) {
    const { month, year } = calendar(life, b.month);
    const k = `${MONTHS[month - 1]} ${year}`;
    byMonth.set(k, [...(byMonth.get(k) ?? []), b]);
  }
  const played = games.filter((b) => b.min > 0);
  const rows = [
    ...[...byMonth.entries()].map(([k, v]) => splitRow(k, v)),
    splitRow("Last 5", played.slice(-5)),
    splitRow("Last 10", played.slice(-10)),
    splitRow(
      "In wins",
      games.filter((b) => b.teamScore > b.oppScore),
    ),
    splitRow(
      "In losses",
      games.filter((b) => b.teamScore < b.oppScore),
    ),
  ];
  return (
    <>
      <SeasonSelect life={life} keys={keys} value={key} onChange={setPicked} />
      <Table head={["Split", "", "GP", "MIN", "PTS", "REB", "AST", "TS%", "GmSc", "W-L"]} minW={520} note="Per-game averages. A dash means no games in that split, not 0.">
        {rows.map((r) => (
          <tr key={r.label} className={rowCls}>
            <td className="text-left font-sans" colSpan={2}>
              {r.label}
            </td>
            {r.cells.map((v, i) => (
              <td key={i}>{v}</td>
            ))}
          </tr>
        ))}
      </Table>
    </>
  );
}

function National({ life }: { life: LifeState }) {
  const nat = nationalTeam(life);
  const intl = life.international;
  const medals = { gold: 0, silver: 0, bronze: 0 };
  for (const t of intl.tournaments) if (t.medal) medals[t.medal]++;
  const next = upcoming(life, 4);
  const lvl = Math.round(performanceLevel(life));
  if (!nat) return <p className="text-[12.5px] text-[var(--os-dim)]">His country has no FIBA federation, so there is no national team to play for.</p>;
  const c = country(nat);
  return (
    <div className="flex flex-col gap-3 text-[12.5px]">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <span className="text-[14px] font-medium">
          {countryFlag(c.id)} {c.name}
        </span>
        <span className="font-mono text-[11.5px] text-[var(--os-dim)]">{c.fibaRank ? `FIBA world #${c.fibaRank.rank}` : "Not in the FIBA ranking"}</span>
        <span className="font-mono text-[11.5px]">{intl.caps} caps</span>
        {medals.gold + medals.silver + medals.bronze > 0 ? (
          <span className="font-mono text-[11.5px]">
            {medals.gold ? <span style={{ color: "#E2C044" }}>{medals.gold} gold </span> : null}
            {medals.silver ? <span style={{ color: "#C0C7CC" }}>{medals.silver} silver </span> : null}
            {medals.bronze ? <span style={{ color: "#C78A55" }}>{medals.bronze} bronze</span> : null}
          </span>
        ) : null}
        {intl.declined ? <span className="font-mono text-[11.5px] text-[var(--os-dim)]">declined {intl.declined}</span> : null}
      </div>
      {intl.tournaments.length ? (
        <Table head={["Year", "Event", "Age", "Finish", "GP", "PTS", "REB", "AST", "TS%"]} minW={560}>
          {intl.tournaments
            .slice()
            .reverse()
            .map((t) => {
              const g = Math.max(1, t.gp);
              return (
                <tr key={t.id} className={rowCls}>
                  <td className="text-left">{t.year}</td>
                  <td className="max-w-[200px] truncate text-left font-sans" title={t.name}>
                    {t.name}
                  </td>
                  <td>{t.age}</td>
                  <td
                    style={{
                      color: t.medal === "gold" ? "#E2C044" : t.medal === "silver" ? "#C0C7CC" : t.medal === "bronze" ? "#C78A55" : undefined,
                    }}
                  >
                    {t.finish}
                  </td>
                  <td>{t.gp}</td>
                  <td>{t.gp ? (t.pts / g).toFixed(1) : "—"}</td>
                  <td>{t.gp ? (t.reb / g).toFixed(1) : "—"}</td>
                  <td>{t.gp ? (t.ast / g).toFixed(1) : "—"}</td>
                  <td>{pct(advanced(t).ts)}</td>
                </tr>
              );
            })}
        </Table>
      ) : (
        <p className="text-[var(--os-dim)]">No national team tournaments yet.</p>
      )}
      {next.length ? (
        <div>
          <h3 className="mb-1 font-mono text-[11px] uppercase tracking-[0.14em] text-[var(--os-dim)]">Coming up</h3>
          <ul className="flex flex-col gap-1">
            {next.map(({ t, qualified, bar }) => (
              <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-[var(--os-border)]/50 pb-1">
                <span>
                  {MONTHS[t.month - 1]} {t.year} · {t.name} <span className="text-[var(--os-dim)]">({KIND_LABEL[t.kind]})</span>
                </span>
                <span className="font-mono text-[11px] tabular-nums">
                  {qualified ? <Chip tone="green">qualified</Chip> : <Chip tone="dim">not qualified</Chip>}{" "}
                  <span className={lvl >= bar ? "text-[var(--os-green)]" : "text-[var(--os-dim)]"}>
                    bar {bar} · you {lvl}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <p className="text-[11px] text-[var(--os-dim)]">
        Qualification and selection are modeled from FIBA ranking points and his level, not real qualifying results. Youth event cadence is simplified. The senior calendar follows the announced cycle:
        World Cup 2027 in Qatar, Olympics 2028 in Los Angeles and 2032 in Brisbane.
      </p>
    </div>
  );
}
