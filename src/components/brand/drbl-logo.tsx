import Image from "next/image";

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
 * atmosphere accents. Adapts to light/dark via theme tokens. With the
 * wordmark, light mode shows the ribbon wordmark image instead; its letters
 * are near-black, so dark mode keeps the tile lockup.
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
        withWordmark && "drbl-logo--image",
        className
      )}
    >
      {withWordmark ? (
        <Image
          src="/brand/drbl-wordmark-light.png"
          alt="DRBL"
          width={663}
          height={136}
          priority
          unoptimized
          className="drbl-logo__image h-6 w-auto sm:h-7"
        />
      ) : null}
      <span className="drbl-logo__mark" aria-hidden>
        <svg
          viewBox="0 0 32 32"
          className="drbl-logo__glyph"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            className="drbl-logo__arc-outer"
            d="M10 6.5c7.2 0 13 5.8 13 13"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <path
            className="drbl-logo__arc-inner"
            d="M10 11c4.7 0 8.5 3.8 8.5 8.5"
            strokeWidth="1.7"
            strokeLinecap="round"
          />
          <path
            className="drbl-logo__spine"
            d="M10 6.5v13"
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          <circle className="drbl-logo__ball" cx="22.5" cy="19.2" r="2.35" />
          <circle
            className="drbl-logo__ball-ring"
            cx="22.5"
            cy="19.2"
            r="2.35"
            fill="none"
            strokeWidth="0.75"
          />
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
