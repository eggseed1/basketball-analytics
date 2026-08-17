"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

type ProvenancePayload = {
  season?: string;
  artifactPath?: string;
  artifactHash?: string;
  artifactGenerationId?: string | null;
  sourceGameCount?: number | null;
  playerCount?: number;
  rankingVersion?: string | null;
  abilityLineageVersion?: string | null;
  warFormulaVersion?: string | null;
  warCalibrationAbilityInput?: string | null;
  warArchitectureClass?: string;
  generatedAt?: string | null;
  error?: string;
};

/**
 * Dev-only provenance strip. Shown when `?debug=1` is present.
 */
export function BoardProvenanceDebug({ season }: { season: string }) {
  const searchParams = useSearchParams();
  const debug = searchParams.get("debug") === "1";
  const [data, setData] = useState<ProvenancePayload | null>(null);

  useEffect(() => {
    if (!debug) return;
    let cancelled = false;
    void fetch(`/api/drbl/provenance?season=${encodeURIComponent(season)}`)
      .then((r) => r.json())
      .then((json: ProvenancePayload) => {
        if (!cancelled) setData(json);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setData({
            error: err instanceof Error ? err.message : "provenance fetch failed",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [debug, season]);

  if (!debug) return null;

  return (
    <aside
      className="rounded-md border border-dashed border-border bg-muted/30 p-3 font-mono text-xs text-muted-foreground"
      data-testid="board-provenance-debug"
    >
      <p className="mb-2 font-sans text-sm font-medium text-foreground">
        DRBL board provenance (debug)
      </p>
      {!data ? (
        <p>Loading…</p>
      ) : data.error ? (
        <p>{data.error}</p>
      ) : (
        <dl className="grid gap-1 sm:grid-cols-2">
          <div>season: {data.season}</div>
          <div>playerCount: {data.playerCount}</div>
          <div>gameCount: {data.sourceGameCount}</div>
          <div>generation: {data.artifactGenerationId}</div>
          <div className="sm:col-span-2">artifact: {data.artifactPath}</div>
          <div className="sm:col-span-2 break-all">
            hash: {data.artifactHash}
          </div>
          <div>ranking: {data.rankingVersion}</div>
          <div>abilityLineage: {data.abilityLineageVersion}</div>
          <div>warFormula: {data.warFormulaVersion ?? "provisional-1/30"}</div>
          <div>warInput: {data.warCalibrationAbilityInput}</div>
          <div>warClass: {data.warArchitectureClass}</div>
          <div>generatedAt: {data.generatedAt}</div>
        </dl>
      )}
    </aside>
  );
}
