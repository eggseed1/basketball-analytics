import { getTranslations } from "next-intl/server";

import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";

export default async function Loading() {
  const t = await getTranslations("Offseason");
  return (
    <DestinationLoadingFrame
      title={t("loadingTitle")}
      context="offseason"
      className="py-5 sm:py-7"
    />
  );
}
