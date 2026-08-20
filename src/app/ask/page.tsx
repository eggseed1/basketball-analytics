import { AskDrblView } from "@/components/ask/ask-drbl-view";
import { getAskDrblAnswer } from "@/data/queries/ask-drbl";
import {
  composeAskBuilderQuery,
  parseAskBuilderParams,
  validateAskBuilderState,
  type AskInputMode,
} from "@/query-engine/ask-builder";
import { parseAskContextFromSearchParams } from "@/query-engine/ask-context";
import { daySeed } from "@/query-engine/ask-examples";

export const metadata = {
  title: "ASK DRBL",
  description:
    "Natural-language basketball analytics - structured queries over trusted DRBL data.",
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
    from?: string;
    date?: string;
  }>;
}

export default async function AskPage({ searchParams }: AskPageProps) {
  const sp = await searchParams;
  const mode: AskInputMode = sp.mode === "builder" ? "builder" : "natural";
  const askContext = parseAskContextFromSearchParams(sp);

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

  // Context never overrides seasons already present in `q` (explicit / builder).
  const result = q
    ? await getAskDrblAnswer(q, { playerId, teamId, context: askContext })
    : null;
  const exampleSeed = (sp.seed ?? "").trim() || daySeed();

  return (
    <main className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <AskDrblView
        initialQuery={q || (sp.q ?? "").trim()}
        result={result}
        initialMode={mode}
        initialBuilder={builder}
        exampleSeed={exampleSeed}
        askContext={askContext}
      />
    </main>
  );
}
