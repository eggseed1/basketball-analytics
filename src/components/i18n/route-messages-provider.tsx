import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import type { ReactNode } from "react";

import { pickRouteClientMessages } from "@/i18n/client-messages";

/** Nest client message catalogs for route-specific useTranslations islands. */
export async function RouteMessagesProvider({
  extras,
  children,
}: {
  extras: readonly string[];
  children: ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <NextIntlClientProvider
      locale={locale}
      messages={pickRouteClientMessages(messages, extras)}
    >
      {children}
    </NextIntlClientProvider>
  );
}
