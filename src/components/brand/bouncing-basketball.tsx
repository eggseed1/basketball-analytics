import { useId, type CSSProperties } from "react";

const SEAMS = [
  "M50 6c-2.5 16-2.5 72 0 88",
  "M6 52c16-8 72-8 88 0",
  "M30 8C10 28 10 72 30 92",
  "M70 8C90 28 90 72 70 92",
].join(" ");

/** Squash-and-stretch bounce. Same motion in the home card and the phone launch screen. */
export function BouncingBasketball({
  size = 56,
  className,
}: {
  size?: number;
  className?: string;
}) {
  const drop = Math.round(size * 1.05);
  const id = useId().replace(/:/g, "");
  return (
    <div
      className={className ? `bb-stage ${className}` : "bb-stage"}
      style={
        {
          width: size * 1.35,
          height: size + drop + 16,
          "--bb-drop": `${drop}px`,
          "--bb-size": `${size}px`,
        } as CSSProperties
      }
    >
      <div className="bb-hop">
        <svg className="bb-ball bb-spin" viewBox="0 0 100 100" aria-hidden>
          <defs>
            <clipPath id={`${id}-clip`}>
              <circle cx="50" cy="50" r="46" />
            </clipPath>
          </defs>
          <g clipPath={`url(#${id}-clip)`}>
            <circle className="bb-skin" cx="50" cy="50" r="46" />
            <circle className="bb-skin-blue" cx="50" cy="50" r="46" />
            <path className="bb-lines" d={SEAMS} />
          </g>
        </svg>
      </div>
      <span className="bb-shadow" />
    </div>
  );
}
