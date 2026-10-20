import type { ReactNode } from "react";

import { RouteMessagesProvider } from "@/components/i18n/route-messages-provider";

/** The archive filter and insight cards are client components that read `Findings`. */
export default function FindingsLayout({ children }: { children: ReactNode }) {
  return <RouteMessagesProvider extras={["Findings"]}>{children}</RouteMessagesProvider>;
}
