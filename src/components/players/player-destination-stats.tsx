/** Shared season metric cells for player destination islands. */

export function VsStat({
  label,
  current,
  career,
}: {
  label: string;
  current: string;
  career: string;
}) {
  return (
    <div className="rounded-lg border border-border/70 bg-white/40 px-2 py-2">
      <dt className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 flex flex-col gap-0.5">
        <span className="font-bold tabular-nums">{current}</span>
        <span className="text-[12px] text-muted-foreground tabular-nums">
          vs {career} career
        </span>
      </dd>
    </div>
  );
}

export function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="text-[16px] font-bold tabular-nums">{value}</dd>
    </div>
  );
}
