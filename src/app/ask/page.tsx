import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

import { MotionReveal } from "@/components/continuity/motion-reveal";
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

type AskSearchParams = Awaited<AskPageProps["searchParams"]>;

function resolveAskRequest(sp: AskSearchParams) {
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
  return { mode, askContext, builder, q, playerId, teamId };
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

export async function generateMetadata({ searchParams }: AskPageProps): Promise<Metadata> {
  const t = await getTranslations("Ask");
  const { q, playerId, teamId, askContext } = resolveAskRequest(await searchParams);
  const base: Metadata = { alternates: { canonical: "/ask" } };
  if (!q) {
    return {
      ...base,
      title: t("metaTitle"),
      description: t("metaDescription"),
    };
  }
  const result = await getAskDrblAnswer(q, { playerId, teamId, context: askContext }).catch(() => null);
  const answered = result && (result.status === "ok" || result.status === "partial") && result.headline;
  const answer = answered
    ? result.valueDisplay
      ? `${result.headline}: ${result.valueDisplay}`
      : result.headline!
    : null;
  return {
    ...base,
    title: { absolute: `${clip(q, 80)} | Ask DRBL` },
    description: answer ? clip(answer, 200) : t("metaDescription"),
  };
}

export default async function AskPage({ searchParams }: AskPageProps) {
  const sp = await searchParams;
  const { mode, askContext, builder, q, playerId, teamId } = resolveAskRequest(sp);

  // Context never overrides seasons already present in `q` (explicit / builder).
  const result = q
    ? await getAskDrblAnswer(q, { playerId, teamId, context: askContext })
    : null;
  const exampleSeed = (sp.seed ?? "").trim() || daySeed();

  return (
    <main data-motion-page className="site-shell flex flex-1 flex-col gap-6 py-6 sm:py-8">
      <MotionReveal />
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
