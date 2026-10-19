import { formatStars } from "@/gm/engine/value";

export function StarValue({ stars }: { stars: number }) {
  return (
    <span className="inline-flex items-center gap-1" aria-label={`${formatStars(stars)} out of 5 stars`}>
      <span className="inline-flex" aria-hidden>
        {Array.from({ length: 5 }, (_, index) => {
          const fill = Math.max(0, Math.min(1, stars - index));
          return (
            <span key={index} className="relative inline-block text-[13px] leading-none text-muted-foreground/40">
              ★
              <span
                className="absolute inset-0 overflow-hidden text-amber-500"
                style={{ width: `${fill * 100}%` }}
              >
                ★
              </span>
            </span>
          );
        })}
      </span>
      <span className="tabular-nums text-xs text-muted-foreground">{formatStars(stars)}</span>
    </span>
  );
}
