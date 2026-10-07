import type { ReactNode } from "react";

import { GlassTintScaleProvider } from "@/components/brand/glass-surface";
import { PageAtmosphere } from "@/components/brand/page-atmosphere";

export const DESTINATION_CARD_TINT_SCALE = 0.3;

/** Team-colored page wash for destination subpages; the wrapped `<main>` needs `relative z-[1]`. */
export function TeamAtmosphere({
  colorA,
  colorB,
  children,
}: {
  colorA?: string | null;
  colorB?: string | null;
  children: ReactNode;
}) {
  return (
    <>
      <PageAtmosphere colorA={colorA} colorB={colorB} />
      <GlassTintScaleProvider scale={DESTINATION_CARD_TINT_SCALE}>{children}</GlassTintScaleProvider>
    </>
  );
}
