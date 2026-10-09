import type { CSSProperties } from "react";

const STEPS = [
  "Checking tonight's scores",
  "Pulling the standings",
  "Ranking the top performers",
  "Reading the injury report",
  "Sorting the trade talk",
];

/**
 * Animated card over the home skeleton while the first render streams. CSS only,
 * so it moves before any JavaScript loads, and it fades in late enough that a
 * fast load never flashes it.
 */
export function HomeWarmup() {
  return (
    <div className="home-warmup" aria-hidden>
      <div className="home-warmup__card">
        <div className="home-warmup__court">
          <div className="home-warmup__hop">
            <svg className="home-warmup__ball" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="#e8702a" />
              <g fill="none" stroke="#3b1a06" strokeWidth="1.6" strokeLinecap="round">
                <circle cx="20" cy="20" r="18" />
                <path d="M2 20h36" />
                <path d="M20 2v36" />
                <path d="M7.5 7.5c5 4 5 21 0 25" />
                <path d="M32.5 7.5c-5 4-5 21 0 25" />
              </g>
            </svg>
          </div>
          <span className="home-warmup__shadow" />
        </div>
        <div className="home-warmup__steps">
          {STEPS.map((step, i) => (
            <span key={step} style={{ "--i": i, "--n": STEPS.length } as CSSProperties}>
              {step}
            </span>
          ))}
        </div>
        <div className="home-warmup__meter" />
      </div>
    </div>
  );
}
