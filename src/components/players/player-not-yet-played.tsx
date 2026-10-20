import { getTranslations } from "next-intl/server";

import { formatOrdinal as ordinal } from "@/lib/format";

export async function PlayerNotYetPlayed({
  playerName,
  draftYear,
  overall,
}: {
  playerName: string;
  draftYear: number;
  overall: number;
}) {
  const t = await getTranslations("PlayerDetail");
  return (
    <section
      className="sports-card flex min-h-[12rem] flex-col justify-center gap-2 p-5 text-center"
      aria-label={t("notYetTitle")}
    >
      <p className="text-[12px] font-semibold uppercase tracking-wide text-muted-foreground">
        {t("notYetTitle")}
      </p>
      <p className="mx-auto max-w-md text-[15px] leading-relaxed text-foreground">
        {t("notYetBody", {
          name: playerName,
          pick: ordinal(overall),
          year: draftYear,
        })}
      </p>
      <p className="mx-auto max-w-md text-[13px] leading-relaxed text-muted-foreground">
        {t("notYetHint")}
      </p>
    </section>
  );
}
