import { describe, expect, test } from "bun:test";
import fc from "fast-check";
import { calculateLevel } from "../../src/engine/scorer.js";
import type { CriterionResult, MaturityLevel, Pillar } from "../../src/types/index.js";

// One generated check: its level, whether it passes, and whether it was skipped.
type Check = { level: MaturityLevel; pass: boolean; skipped: boolean };

const checkArb = fc.record({
  level: fc.constantFrom<MaturityLevel>(1, 2, 3, 4, 5),
  pass: fc.boolean(),
  skipped: fc.boolean(),
});
const checksArb = fc.array(checkArb, { maxLength: 40 });

function score(checks: Check[]) {
  const pillar = {
    id: "p",
    name: "p",
    description: "",
    icon: "",
    criteria: checks.map((c, i) => ({ id: `c${i}`, name: `c${i}`, description: "", pillarId: "p", level: c.level, requiresLLM: false })),
  } as unknown as Pillar;
  const results: CriterionResult[] = checks.map((c, i) => ({ criterionId: `c${i}`, pass: c.pass, message: "", skipped: c.skipped }));
  return calculateLevel([pillar], new Map([["p", results]]));
}

describe("calculateLevel properties", () => {
  test("the level is always between 1 and 5", () => {
    fc.assert(
      fc.property(checksArb, (checks) => {
        const { level } = score(checks);
        expect(level).toBeGreaterThanOrEqual(1);
        expect(level).toBeLessThanOrEqual(5);
      }),
    );
  });

  test("fixing a failing check never lowers the level", () => {
    fc.assert(
      fc.property(checksArb, fc.nat(), (checks, pick) => {
        const failing = checks.flatMap((c, i) => (!c.pass && !c.skipped ? [i] : []));
        fc.pre(failing.length > 0);
        const i = failing[pick % failing.length];
        const fixed = checks.map((c, j) => (j === i ? { ...c, pass: true } : c));
        expect(score(fixed).level).toBeGreaterThanOrEqual(score(checks).level);
      }),
    );
  });

  test("skipped checks do not count, whatever their result", () => {
    fc.assert(
      fc.property(checksArb, (checks) => {
        const flipped = checks.map((c) => (c.skipped ? { ...c, pass: !c.pass } : c));
        expect(score(flipped)).toEqual(score(checks));
      }),
    );
  });

  test("the order of the checks does not matter", () => {
    fc.assert(
      fc.property(checksArb, (checks) => {
        expect(score([...checks].reverse())).toEqual(score(checks));
      }),
    );
  });
});
