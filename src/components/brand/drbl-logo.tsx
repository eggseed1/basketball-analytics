import { cn } from "@/lib/utils";

type DrblLogoProps = {
  className?: string;
  /** Show the DRBL wordmark beside the mark (desktop header). */
  withWordmark?: boolean;
  /** Mark tile size. */
  size?: "sm" | "md";
};

/**
 * Site lockup — frost tile + court-arc mark (range / impact) with NBA
 * atmosphere accents. Adapts to light/dark via theme tokens.
 * Glyph shares the favicon’s optically centered court-arc geometry.
 */
export function DrblLogo({
  className,
  withWordmark = false,
  size = "sm",
}: DrblLogoProps) {
  return (
    <span
      className={cn(
        "drbl-logo inline-flex min-w-0 items-center gap-2.5 text-foreground",
        size === "md" && "drbl-logo--md",
        className
      )}
    >
      <span className="drbl-logo__mark" aria-hidden>
        <svg
          viewBox="0 0 32 32"
          className="drbl-logo__glyph"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g transform="translate(1.4 1.8)">
            <path
              className="drbl-logo__arc-outer"
              d="M8.5 6.25c8.35 0 15.1 6.75 15.1 15.1"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <path
              className="drbl-logo__arc-inner"
              d="M8.5 10.5c5 0 9 4 9 9"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <path
              className="drbl-logo__spine"
              d="M8.5 6.25v15.1"
              strokeWidth="2.6"
              strokeLinecap="round"
            />
            <circle className="drbl-logo__ball" cx="23.1" cy="20.85" r="2.7" />
            <circle
              className="drbl-logo__ball-ring"
              cx="23.1"
              cy="20.85"
              r="2.7"
              fill="none"
              strokeWidth="0.85"
            />
          </g>
        </svg>
      </span>
      {withWordmark ? (
        <span className="drbl-logo__wordmark hidden min-w-0 flex-col leading-none sm:flex">
          <span className="text-[1.2rem] font-bold tracking-[-0.04em]">DRBL</span>
          <span className="mt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
            Analytics
          </span>
        </span>
      ) : null}
    </span>
  );
}
