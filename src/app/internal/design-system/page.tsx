import type { Metadata } from "next";

import { DesignSystemLab } from "@/components/design-system/design-system-lab";

export const metadata: Metadata = {
  title: "Design system",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Owner-only appearance lab. Not linked from public nav.
 * Visit /internal/design-system directly.
 */
export default function DesignSystemPage() {
  return (
    <main className="site-shell flex flex-col gap-5 py-5 sm:py-7">
      <DesignSystemLab />
    </main>
  );
}
