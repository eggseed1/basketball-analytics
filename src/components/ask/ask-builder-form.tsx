"use client";

import { MetricHelp } from "@/components/learn/metric-help";
import {
  ASK_BUILDER_OPERATIONS,
  askBuilderPreviewLabel,
  builderOption,
  listBuilderPlayerSuggestions,
  listBuilderSeasons,
  listBuilderTeams,
  metricsForBuilderOperation,
  validateAskBuilderState,
  type AskBuilderState,
} from "@/query-engine/ask-builder";
import { conceptIdForAskMetric } from "@/lib/learn-column-concepts";
import { cn } from "@/lib/utils";

export function AskBuilderForm({
  state,
  onChange,
  onSubmit,
  pending,
}: {
  state: AskBuilderState;
  onChange: (next: AskBuilderState) => void;
  onSubmit: () => void;
  pending?: boolean;
}) {
  const opt = builderOption(state.operation);
  const metrics = metricsForBuilderOperation(state.operation);
  const seasons = listBuilderSeasons();
  const teams = listBuilderTeams();
  const players = listBuilderPlayerSuggestions();
  const validation = validateAskBuilderState(state);
  const preview = askBuilderPreviewLabel(state);

  function patch(partial: Partial<AskBuilderState>) {
    const next = { ...state, ...partial };
    // Reset metric when operation changes and current metric is invalid.
    if (partial.operation) {
      const allowed = metricsForBuilderOperation(partial.operation);
      if (
        next.metricId &&
        allowed.length &&
        !allowed.some((m) => m.id === next.metricId)
      ) {
        next.metricId = allowed[0]?.id ?? "";
      }
      if (!builderOption(partial.operation).needsMetric) {
        next.metricId = "";
      }
    }
    onChange(next);
  }

  return (
    <div className="flex flex-col gap-4 rounded-md border border-border bg-secondary/20 px-4 py-4 sm:px-5">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="ask-builder-op"
          className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
        >
          Operation
        </label>
        <select
          id="ask-builder-op"
          value={state.operation}
          onChange={(e) =>
            patch({ operation: e.target.value as AskBuilderState["operation"] })
          }
          className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold"
        >
          {ASK_BUILDER_OPERATIONS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {opt.needsPlayer ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ask-builder-player"
              className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              Player
            </label>
            <input
              id="ask-builder-player"
              list="ask-builder-player-list"
              value={state.playerName}
              onChange={(e) => patch({ playerName: e.target.value })}
              placeholder="e.g. Nikola Jokic"
              className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold"
              autoComplete="off"
            />
            <datalist id="ask-builder-player-list">
              {players.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
        ) : null}

        {opt.needsTeam ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ask-builder-team"
              className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              {opt.needsTeamB ? "Team A" : "Team"}
            </label>
            <select
              id="ask-builder-team"
              value={state.teamAbbr}
              onChange={(e) => patch({ teamAbbr: e.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold"
            >
              <option value="">Select team</option>
              {teams.map((t) => (
                <option key={t.abbr} value={t.abbr}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {opt.needsTeamB ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ask-builder-team-b"
              className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              {state.operation === "game_lab" ? "Opponent" : "Team B (optional)"}
            </label>
            <select
              id="ask-builder-team-b"
              value={state.teamAbbrB}
              onChange={(e) => patch({ teamAbbrB: e.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold"
            >
              <option value="">
                {state.operation === "team_season_compare"
                  ? "Same team (season vs season)"
                  : "Select team"}
              </option>
              {teams.map((t) => (
                <option key={t.abbr} value={t.abbr}>
                  {t.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {opt.needsSeason ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ask-builder-season"
              className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              {opt.needsSeasonB ? "Season A" : "Season"}
            </label>
            <select
              id="ask-builder-season"
              value={state.season}
              onChange={(e) => patch({ season: e.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold"
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {opt.needsSeasonB ? (
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="ask-builder-season-b"
              className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              Season B
            </label>
            <select
              id="ask-builder-season-b"
              value={state.seasonB}
              onChange={(e) => patch({ seasonB: e.target.value })}
              className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold"
            >
              {seasons.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        {opt.needsMetric ? (
          <div className="flex flex-col gap-1.5 sm:col-span-2">
            <label
              htmlFor="ask-builder-metric"
              className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground"
            >
              Metric
            </label>
            <select
              id="ask-builder-metric"
              value={state.metricId}
              onChange={(e) =>
                patch({
                  metricId: e.target.value as AskBuilderState["metricId"],
                })
              }
              className="rounded-md border border-border bg-background px-3 py-2 text-[14px] font-semibold"
            >
              {metrics.map((m) => {
                const concept = conceptIdForAskMetric(m.id);
                return (
                  <option key={m.id} value={m.id}>
                    {m.label}
                    {concept ? "" : ""}
                  </option>
                );
              })}
            </select>
            {state.metricId ? (
              <p className="text-[12px] text-muted-foreground">
                {conceptIdForAskMetric(state.metricId) ? (
                  <MetricHelp
                    conceptId={conceptIdForAskMetric(state.metricId)!}
                    labelClassName="font-semibold"
                  >
                    {metrics.find((m) => m.id === state.metricId)?.label ??
                      state.metricId}
                  </MetricHelp>
                ) : (
                  metrics.find((m) => m.id === state.metricId)?.label
                )}
              </p>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="rounded-md border border-border/70 bg-background/80 px-3 py-2.5">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Query preview
        </p>
        <p className="mt-1 text-[14px] font-semibold tracking-tight">{preview}</p>
      </div>

      {!validation.ok ? (
        <ul className="flex flex-col gap-1 text-[13px] text-muted-foreground">
          {validation.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      ) : null}

      <button
        type="button"
        disabled={pending || !validation.ok}
        onClick={onSubmit}
        className={cn(
          "rounded-md bg-foreground px-4 py-2.5 text-[13px] font-bold text-background",
          "disabled:opacity-50"
        )}
      >
        {pending ? "Running…" : "Run query"}
      </button>
    </div>
  );
}
