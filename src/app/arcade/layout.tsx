import type { ReactNode } from "react";

import { RouteMessagesProvider } from "@/components/i18n/route-messages-provider";

const ARCADE_NAMESPACES = [
  "Arcade",
  "ArcadeDaily",
  "ArcadeHL",
  "ArcadeZero",
  "ArcadeChain",
  "ArcadeOneShot",
] as const;

export default function ArcadeLayout({ children }: { children: ReactNode }) {
  return (
    <RouteMessagesProvider extras={ARCADE_NAMESPACES}>
      {children}
    </RouteMessagesProvider>
  );
}
