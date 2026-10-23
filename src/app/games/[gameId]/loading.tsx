import { getTranslations } from "next-intl/server";

import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";
import { DestinationLoadingWatchdog } from "@/components/continuity/destination-loading-watchdog";

export default async function Loading() {
  const t = await getTranslations("Games");
  return (
    <>
      <DestinationLoadingWatchdog waitMs={5_000} />
      <DestinationLoadingFrame
        title={t("loadingTitle")}
        subtitle={t("loadingSubtitle")}
      />
    </>
  );
}
