import type { ReactNode } from "react";

import { RouteMessagesProvider } from "@/components/i18n/route-messages-provider";

/** Client Learn views (topic, stat guide) read section headings from LearnPages. */
export default function LearnLayout({ children }: { children: ReactNode }) {
  return (
    <RouteMessagesProvider extras={["LearnPages"]}>{children}</RouteMessagesProvider>
  );
}
