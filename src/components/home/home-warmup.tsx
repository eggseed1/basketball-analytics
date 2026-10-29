import type { CSSProperties } from "react";

import { BouncingBasketball } from "@/components/brand/bouncing-basketball";
import { loadingPhrasesFor } from "@/lib/loading-phrases";

const STEPS = loadingPhrasesFor("home");

/**
 * Animated card over the home skeleton while the first render streams. CSS only,
 * so it moves before any JavaScript loads, and it fades in late enough that a
 * fast load never flashes it.
 */
export function HomeWarmup() {
  return (
    <div className="home-warmup" aria-hidden>
      <div className="home-warmup__card">
        <BouncingBasketball size={52} />
        <div className="home-warmup__steps">
          {STEPS.map((step, i) => (
            <span
              key={step}
              style={{ "--i": i, "--n": STEPS.length } as CSSProperties}
            >
              {step}
            </span>
          ))}
        </div>
        <div className="home-warmup__meter" />
      </div>
    </div>
  );
}
