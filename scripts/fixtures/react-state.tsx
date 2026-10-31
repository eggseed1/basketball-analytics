import { StrictMode, useState } from "react";
import { createRoot } from "react-dom/client";
import { navigate } from "next/navigation";
import { RouteTransitionProvider, useRouteTransitionOptional } from "../../src/components/continuity/route-transition";
import { TransitionLink } from "../../src/components/continuity/query-nav";
import { useLiveGamePlayers } from "../../src/components/games/use-live-game-players";
import { useLiveGamePlayByPlay } from "../../src/components/games/use-live-game-play-by-play";
import { CareerChartFilterWipe } from "../../src/components/players/career-chart-filter-wipe";
import { ContractValueChart } from "../../src/components/players/contract-value-chart";
import type { PlayerGame, PlayByPlayEvent } from "../../src/data/types";

const player = (name: string) => [{ playerName: name, playerId: name }] as PlayerGame[];
const plays = (id: string, period = 1, clockSeconds = 700) => [{ id, period, clockSeconds }] as PlayByPlayEvent[];
globalThis.fetch = async input => {
  const id = String(input).split("/")[3];
  return new Response(JSON.stringify({ data: { players: player(`polled-${id}`), events: plays(`polled-${id}`, 1, 300) } }), { headers: { "Content-Type": "application/json" } });
};

function LiveState() {
  const [source, setSource] = useState({ gameId: "one", players: player("seed-one"), events: plays("seed-one"), enabled: false });
  const lines = useLiveGamePlayers(source.gameId, source.players, "in_progress", source.enabled);
  const events = useLiveGamePlayByPlay(source.gameId, source.events, "in_progress", source.enabled);
  return <section aria-label="Live state">
    <output aria-label="Player data">{lines.map(p => p.playerName).join(",")}</output>
    <output aria-label="Play data">{events.at(-1)?.id}</output>
    <button onClick={() => setSource(s => ({ ...s, enabled: true }))}>Enable live</button>
    <button onClick={() => setSource(s => ({ ...s, events: plays("older-server", 1, 650) }))}>Older server seed</button>
    <button onClick={() => setSource(s => ({ ...s, events: plays("newer-server", 2, 600), enabled: false }))}>Newer server seed</button>
    <button onClick={() => setSource({ gameId: "two", players: player("seed-two"), events: plays("seed-two"), enabled: false })}>Another game</button>
  </section>;
}

function ChartState() {
  const [filter, setFilter] = useState(0);
  const [revision, setRevision] = useState(0);
  const [season, setSeason] = useState("2025-26");
  const years = ["2025-26", "2026-27", "2027-28"].map(year => ({ season: year, salary: 10_000_000, worth: 12_000_000, worthLow: 11_000_000, worthHigh: 13_000_000, surplus: 2_000_000, note: null }));
  return <section aria-label="Charts">
    <button onClick={() => setFilter(f => f + 1)}>Next filter</button>
    <button onClick={() => setRevision(r => r + 1)}>Refresh chart content</button>
    <CareerChartFilterWipe transitionKey={String(filter)}>
      <output aria-label="Chart data">{filter}:{revision}</output>
      <svg width="30" height="30"><g className="recharts-line"><path d="M0 0 L30 30" /></g></svg>
    </CareerChartFilterWipe>
    <button onClick={() => setSeason("2026-27")}>Change preferred season</button>
    <ContractValueChart years={years} initialSeason={season} />
  </section>;
}

function RouteState() {
  const transition = useRouteTransitionOptional()!;
  return <section aria-label="Route state">
    <output aria-label="Route pending">{transition.pending ? "pending" : "idle"}</output>
    <button onClick={() => transition.startRouteTransition(() => {})}>Start navigation</button>
    <button onClick={() => navigate("/next")}>Finish navigation</button>
    <button onClick={() => navigate("/one")}>Return navigation</button>
  </section>;
}

createRoot(document.getElementById("root")!).render(<StrictMode>
  <LiveState />
  <ChartState />
  <RouteTransitionProvider><RouteState /></RouteTransitionProvider>
  <TransitionLink href="/two">Local navigation</TransitionLink>
</StrictMode>);
