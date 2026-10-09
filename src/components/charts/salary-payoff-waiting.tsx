import { TextLink } from "@/components/ui/text-link";
import type { PayoffWaiting } from "@/data/runtime/salary-payoff";
import { type } from "@/lib/design-system";
import { shortDate } from "@/lib/salary-payoff";
import { cn } from "@/lib/utils";

/** Before the first night of games: say when lines start rather than drawing last season. */
export function SalaryPayoffWaiting({
  waiting,
  previousHref,
  className,
}: {
  waiting: PayoffWaiting;
  previousHref: string | null;
  className?: string;
}) {
  return (
    <p className={cn(type.bodySm, "text-muted-foreground", className)}>
      The {waiting.season} lines start after opening night
      {waiting.opener ? `, ${shortDate(waiting.opener)}` : ""}. Every player begins at 0 and climbs as his play
      covers his salary.
      {waiting.previous && previousHref ? (
        <>
          {" "}
          <TextLink href={previousHref}>
            See how {waiting.previous} finished <span data-motion-arrow aria-hidden>→</span>
          </TextLink>
        </>
      ) : null}
    </p>
  );
}
