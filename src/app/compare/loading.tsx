import { getTranslations } from "next-intl/server";
import { DestinationLoadingFrame } from "@/components/continuity/destination-loading-frame";

export default async function Loading() {
  const t = await getTranslations("Compare");
  return (
    <DestinationLoadingFrame
      title={t("title")}
      subtitle={t("loadingSubtitle")}
    />
  );
}
