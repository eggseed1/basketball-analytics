import { P1_POINTS_PER_WIN } from "@/lib/drbl-public-labels";

import {
  MathDisplay,
  MathEq,
  MathFrac,
  MathMul,
  MathNote,
  MathOp,
  MathRoman,
  MathStack,
  MathVar,
} from "@/components/learn/math-equation";

import boxForwardWeights from "../../../drbl/models/box-forward-weights.json";
import { BOX_PRIOR_CONFIG } from "../../../drbl/models/box-prior";

const P1 = P1_POINTS_PER_WIN;

const BOX_HANDOFF = BOX_PRIOR_CONFIG.shrinkK;
const BOX_SCALE = BOX_PRIOR_CONFIG.boxScale;
const SAMPLE_K = boxForwardWeights.playerShrinkK;
const CALIBRATION_FIRST = boxForwardWeights.calibration[0]!.calibration;
const CALIBRATION_FIRST_GAMES = boxForwardWeights.calibration[0]!.games;
const CALIBRATION_FULL = boxForwardWeights.calibration.at(-1)!.calibration;

/** Full production DRBL/100 formula stack for Learn → Full depth. */
export function Drbl100FormulaEquations() {
  return (
    <div className="flex flex-col gap-5">
      <MathStack title="1. Play-by-play rate">
        <MathDisplay>
          <MathEq
            lhs={
              <MathRoman>
                rawAbilityRate
              </MathRoman>
            }
            rhs={
              <MathMul>
                <span>100</span>
                <MathOp>×</MathOp>
                <MathFrac
                  num={<MathVar>V</MathVar>}
                  den={<MathVar>N</MathVar>}
                />
              </MathMul>
            }
          />
          <MathNote>
            <MathVar>V</MathVar> = Approach-B attributed residual value (point
            equivalents vs the role-matched R1 expected-points baseline).{" "}
            <MathVar>N</MathVar> = combined on-court possession appearances
            (offense + defense counted separately). Units: points per 100
            possessions.
          </MathNote>
        </MathDisplay>
      </MathStack>

      <MathStack title="2. Mix with the box score">
        <MathDisplay>
          <MathEq
            lhs={<MathVar>w</MathVar>}
            rhs={
              <MathFrac
                num={<MathVar>N</MathVar>}
                den={
                  <span>
                    <MathVar>N</MathVar>
                    <MathOp>+</MathOp>
                    <span className="tabular-nums">{BOX_HANDOFF.toLocaleString()}</span>
                  </span>
                }
              />
            }
          />
        </MathDisplay>
        <MathDisplay>
          <MathEq
            lhs={<MathRoman>mix</MathRoman>}
            rhs={
              <MathMul>
                <MathVar>w</MathVar>
                <MathOp>×</MathOp>
                <MathRoman>rawAbilityRate</MathRoman>
                <MathOp>+</MathOp>
                <span className="whitespace-nowrap">
                  (1 <MathOp>−</MathOp> <MathVar>w</MathVar>)
                </span>
                <MathOp>×</MathOp>
                <span>{BOX_SCALE}</span>
                <MathOp>×</MathOp>
                <MathRoman>box</MathRoman>
              </MathMul>
            }
          />
          <MathNote>
            <MathRoman>box</MathRoman> = a rating from per-100 box-score stats,
            with weights fit each season to lineup scoring margins. At{" "}
            {BOX_HANDOFF.toLocaleString()} possessions the play-by-play rate and
            the box score count equally.
          </MathNote>
        </MathDisplay>
      </MathStack>

      <MathStack title="3. Blend with the box-score forecast">
        <MathDisplay>
          <MathEq
            lhs={<MathRoman>blend</MathRoman>}
            rhs={
              <MathMul>
                <span>½</span>
                <MathOp>×</MathOp>
                <MathRoman>mix</MathRoman>
                <MathOp>+</MathOp>
                <span>½</span>
                <MathOp>×</MathOp>
                <MathVar>s</MathVar>
                <MathOp>×</MathOp>
                <MathRoman>forecast</MathRoman>
              </MathMul>
            }
          />
          <MathNote>
            <MathRoman>forecast</MathRoman> = a linear prediction of the
            player&apos;s on-court scoring margin in later games, from per-100
            box-score stats, minutes, starts, the play-by-play rate and his
            on-court net rating. Its weights are fit on what happened later in
            past seasons. <MathVar>s</MathVar> puts it on the same spread as{" "}
            <MathRoman>mix</MathRoman> for the season.
          </MathNote>
        </MathDisplay>
      </MathStack>

      <MathStack title="4. DRBL/100 (published ranking rate)">
        <MathDisplay>
          <MathEq
            lhs={<MathRoman>DRBL/100</MathRoman>}
            rhs={
              <MathMul>
                <MathVar>c</MathVar>
                <MathOp>×</MathOp>
                <MathFrac
                  num={<MathVar>N</MathVar>}
                  den={
                    <span>
                      <MathVar>N</MathVar>
                      <MathOp>+</MathOp>
                      <MathVar>K</MathVar>
                    </span>
                  }
                />
                <MathOp>×</MathOp>
                <MathRoman>blend</MathRoman>
              </MathMul>
            }
          />
          <MathNote>
            <MathVar>K</MathVar> = {SAMPLE_K.toLocaleString()} possessions, the
            value that left the least error on later games.{" "}
            <MathVar>c</MathVar> rescales the blend to points per 100 in later
            games. It grows with the number of games behind the rating, from{" "}
            {CALIBRATION_FIRST.toFixed(2)} after the first{" "}
            {CALIBRATION_FIRST_GAMES} league games to{" "}
            {CALIBRATION_FULL.toFixed(2)} for a full season.
          </MathNote>
        </MathDisplay>
      </MathStack>
    </div>
  );
}

/** Full production WAR1 formula stack for Learn → Full depth. */
export function War1FormulaEquations() {
  return (
    <div className="flex flex-col gap-5">
      <MathStack title="1. R1 Points (accounting total)">
        <MathDisplay>
          <MathEq
            lhs={<MathRoman>R1 Points</MathRoman>}
            rhs={<MathVar>V</MathVar>}
          />
        </MathDisplay>
        <MathDisplay>
          <MathEq
            lhs={<MathRoman>R1 Points</MathRoman>}
            rhs={
              <MathMul>
                <MathFrac
                  num={
                    <span>
                      <MathRoman>rawAbilityRate</MathRoman>
                      <MathOp>×</MathOp>
                      <MathVar>N</MathVar>
                    </span>
                  }
                  den={<span>100</span>}
                />
              </MathMul>
            }
          />
          <MathNote>
            Same Approach-B attributed residual <MathVar>V</MathVar> as in the
            DRBL/100 path. WAR1 is built from this realized ledger, not from
            shrinking DRBL/100 again.
          </MathNote>
        </MathDisplay>
      </MathStack>

      <MathStack title="2. Frozen points-per-win constant (P1)">
        <MathDisplay>
          <MathEq
            lhs={<MathVar>P1</MathVar>}
            rhs={<span className="not-italic tabular-nums">{P1}</span>}
          />
          <MathNote>
            Frozen development constant (points of scoreboard-equivalent margin
            per win-style unit). Do not refit on the public product.
          </MathNote>
        </MathDisplay>
      </MathStack>

      <MathStack title="3. WAR1 (published season value)">
        <MathDisplay>
          <MathEq
            lhs={<MathRoman>WAR1</MathRoman>}
            rhs={
              <MathFrac
                num={<MathRoman>R1 Points</MathRoman>}
                den={<MathVar>P1</MathVar>}
              />
            }
          />
        </MathDisplay>
        <MathDisplay>
          <MathEq
            lhs={
              <span>
                rank(<MathRoman>WAR1</MathRoman>)
              </span>
            }
            rhs={
              <span>
                rank(<MathRoman>R1 Points</MathRoman>)
              </span>
            }
          />
          <MathNote>
            Because <MathVar>P1</MathVar> is a fixed positive constant, ordering
            is identical. WAR1 means win-style units above the contextual
            role-matched R1 reference, not classic replacement-level WAR.
          </MathNote>
        </MathDisplay>
      </MathStack>
    </div>
  );
}

export function GuideFormulaEquations({ slug }: { slug: string }) {
  if (slug === "drbl-100") return <Drbl100FormulaEquations />;
  if (slug === "war1") return <War1FormulaEquations />;
  return null;
}
