import Link from "next/link";

import { type } from "@/lib/design-system";
import { photoCreditFor } from "@/lib/photo-credits";
import { cn } from "@/lib/utils";

/** Visible license credit for a Wikimedia Commons portrait; renders nothing for other photos. */
export function PhotoCreditLine({
  portraitUrl,
  className,
}: {
  portraitUrl: string | null | undefined;
  className?: string;
}) {
  const credit = photoCreditFor(portraitUrl);
  if (!credit) return null;
  const linkClass = "underline underline-offset-2 hover:text-foreground";
  return (
    <p className={cn(type.caption, "text-muted-foreground", className)}>
      Photo:{" "}
      {credit.filePage ? (
        <a href={credit.filePage} className={linkClass} target="_blank" rel="noreferrer">
          {credit.author}
        </a>
      ) : (
        credit.author
      )}
      ,{" "}
      {credit.licenseUrl ? (
        <a href={credit.licenseUrl} className={linkClass} target="_blank" rel="noreferrer license">
          {credit.license}
        </a>
      ) : (
        credit.license
      )}
      , via Wikimedia Commons. Cropped from the original.{" "}
      <Link href="/sources#photo-credits" className={linkClass}>
        Credits
      </Link>
    </p>
  );
}
