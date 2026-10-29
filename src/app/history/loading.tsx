import { getTranslations } from "next-intl/server";

import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";

export default async function Loading() {
  const t = await getTranslations("History");
  return (
    <DestinationLoadingFrame title={t("loadingTitle")} context="history" />
  );
}
