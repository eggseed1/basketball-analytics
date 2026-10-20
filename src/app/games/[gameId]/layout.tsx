import type { ReactNode } from "react";

import { RouteMessagesProvider } from "@/components/i18n/route-messages-provider";

/** Game identity shell and preview panel are client components that read `Games`. */
export default function GameLayout({ children }: { children: ReactNode }) {
  return <RouteMessagesProvider extras={["Games"]}>{children}</RouteMessagesProvider>;
}
