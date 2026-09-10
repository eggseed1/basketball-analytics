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

const P1 = P1_POINTS_PER_WIN;

/** Full production DRBL/100 formula stack for Learn → Full depth. */
export function Drbl100FormulaEquations() {
  return (
    <div className="flex flex-col gap-5">
      <MathStack title="1. Raw ability rate">
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

      <MathStack title="2. Empirical-Bayes reliability">
        <MathDisplay>
          <MathEq
            lhs={<MathVar>ρ</MathVar>}
            rhs={
              <MathFrac
                num={<MathVar>N</MathVar>}
                den={
                  <span>
                    <MathVar>N</MathVar>
                    <MathOp>+</MathOp>
                    <MathVar>k</MathVar>
                  </span>
                }
              />
            }
          />
          <MathNote>
            Prior strength <MathVar>k</MathVar> = 1600. Reliability is the weight
            on the observed rate versus the prior.
          </MathNote>
        </MathDisplay>
      </MathStack>

      <MathStack title="3. Validated DRBL/100 (published ranking rate)">
        <MathDisplay>
          <MathEq
            lhs={<MathRoman>DRBL/100</MathRoman>}
            rhs={
              <MathMul>
                <MathVar>ρ</MathVar>
                <MathOp>×</MathOp>
                <MathRoman>rawAbilityRate</MathRoman>
                <MathOp>+</MathOp>
                <span className="whitespace-nowrap">
                  (1 <MathOp>−</MathOp> <MathVar>ρ</MathVar>)
                </span>
                <MathOp>×</MathOp>
                <span className="italic whitespace-nowrap">
                  μ<sub className="text-[0.7em] not-italic">0</sub>
                </span>
              </MathMul>
            }
          />
        </MathDisplay>
        <MathDisplay>
          <MathEq
            lhs={
              <span>
                <MathRoman>DRBL/100</MathRoman>
              </span>
            }
            rhs={
              <MathMul>
                <MathFrac
                  num={<MathVar>N</MathVar>}
                  den={
                    <span>
                      <MathVar>N</MathVar>
                      <MathOp>+</MathOp>
                      <MathVar>k</MathVar>
                    </span>
                  }
                />
                <MathOp>×</MathOp>
                <MathRoman>rawAbilityRate</MathRoman>
              </MathMul>
            }
          />
          <MathNote>
            Production lock: prior mean{" "}
            <MathVar>
              μ<sub className="text-[0.75em] not-italic">0</sub>
            </MathVar>{" "}
            = 0, <MathVar>k</MathVar> = 1600, identity calibration (no second
            shrink or fusion). Equivalent name in the model:{" "}
            <span className="font-mono text-[11px]">validatedDRBL100</span>.
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
            DRBL/100 path. WAR1 is built from this realized ledger — not from
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
            role-matched R1 reference — not classic replacement-level WAR.
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
