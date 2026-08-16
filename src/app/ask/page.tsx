import { AskDrblView } from "@/components/ask/ask-drbl-view";
import { getAskDrblAnswer } from "@/data/queries/ask-drbl";
import {
  composeAskBuilderQuery,
  parseAskBuilderParams,
  validateAskBuilderState,
  type AskInputMode,
} from "@/query-engine/ask-builder";
import { daySeed } from "@/query-engine/ask-examples";

export const metadata = {
  title: "ASK DRBL",
  description:
    "Natural-language basketball analytics — structured queries over trusted DRBL data.",
};

interface AskPageProps {
  searchParams: Promise<{
    q?: string;
    playerId?: string;
    teamId?: string;
    mode?: string;
    op?: string;
    player?: string;
    team?: string;
    teamB?: string;
    season?: string;
    seasonB?: string;
    metric?: string;
    seed?: string;
  }>;
}

export default async function AskPage({ searchParams }: AskPageProps) {
  const sp = await searchParams;
  const mode: AskInputMode = sp.mode === "builder" ? "builder" : "natural";
  const builder = parseAskBuilderParams({
    op: sp.op,
    player: sp.player,
    team: sp.team,
    teamB: sp.teamB,
    season: sp.season,
    seasonB: sp.seasonB,
    metric: sp.metric,
  });

  let q = (sp.q ?? "").trim();
  if (!q && mode === "builder") {
    const valid = validateAskBuilderState(builder);
    if (valid.ok) q = composeAskBuilderQuery(builder).trim();
  }

  const playerId = (sp.playerId ?? "").trim() || undefined;
  const teamId = (sp.teamId ?? "").trim() || undefined;
  const result = q ? await getAskDrblAnswer(q, { playerId, teamId }) : null;
  const exampleSeed = (sp.seed ?? "").trim() || daySeed();

  return (
    <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <AskDrblView
        initialQuery={q || (sp.q ?? "").trim()}
        result={result}
        initialMode={mode}
        initialBuilder={builder}
        exampleSeed={exampleSeed}
      />
    </main>
  );
}
