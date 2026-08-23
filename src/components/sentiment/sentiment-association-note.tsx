import Link from "next/link";

import { type } from "@/lib/design-system";
import { cn } from "@/lib/utils";

export function SentimentAssociationNote({
  association,
  className,
}: {
  association: {
    explanation: string;
    eventKind?: string;
    eventRef?: string;
  };
  className?: string;
}) {
  const movementHref =
    association.eventKind === "movement_story" && association.eventRef
      ? `/movement?cluster=${encodeURIComponent(association.eventRef)}`
      : null;

  return (
    <p className={cn(type.caption, "text-muted-foreground", className)}>
      {association.explanation}
      {movementHref ? (
        <>
          {" "}
          <Link href={movementHref} className="font-semibold underline">
            View movement story →
          </Link>
        </>
      ) : null}
    </p>
  );
}
