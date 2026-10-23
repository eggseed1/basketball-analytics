import { getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import type { ReactNode } from "react";

import { RouteMessagesProvider } from "@/components/i18n/route-messages-provider";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("GmUi");
  return {
    alternates: { canonical: "/gm" },
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default function GmLayout({ children }: { children: ReactNode }) {
  return (
    <RouteMessagesProvider extras={["Gm", "GmUi"]}>
      {children}
    </RouteMessagesProvider>
  );
}
