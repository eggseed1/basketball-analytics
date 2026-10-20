import Link from "next/link";
import { getTranslations } from "next-intl/server";

/** Controlled unavailable state — never invent ? 0-0 FINAL. */
export async function GameUnavailablePanel({
  gameId,
  backHref = "/explore/games",
}: {
  gameId: string;
  backHref?: string;
}) {
  const t = await getTranslations("Games");
  const tCommon = await getTranslations("Common");
  return (
    <div className="sports-card flex flex-col gap-3 p-6">
      <h1 className="text-[20px] font-semibold tracking-tight">
        {t("unavailableTitle")}
      </h1>
      <p className="text-[14px] text-muted-foreground">
        {t("unavailableBody")}
      </p>
      <p className="text-[12px] tabular-nums text-muted-foreground">
        {t("unavailableReference", { id: gameId })}
      </p>
      <div className="mt-2 flex flex-wrap gap-3 text-[14px]">
        <Link href={backHref} className="font-semibold underline-offset-4 hover:underline">
          {t("unavailableBack")}
        </Link>
        <Link href="/explore" className="underline-offset-4 hover:underline">
          {tCommon("search")}
        </Link>
      </div>
    </div>
  );
}
