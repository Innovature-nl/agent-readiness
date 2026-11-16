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

  test("fixing the remaining number of checks reaches the next level", () => {
    fc.assert(
      fc.property(checksArb, (checks) => {
        const { nextLevelProgress: next } = score(checks);
        fc.pre(next.nextLevel !== null);
        // Without any check at or above the next level there is nothing to reach.
        fc.pre(checks.some((c) => !c.skipped && c.level >= (next.nextLevel as number)));
        // Fix checks from the lowest level up, as many as the report says are missing.
        const order = checks
          .map((c, i) => ({ ...c, i }))
          .filter((c) => !c.pass && !c.skipped && c.level <= (next.nextLevel as number))
          .sort((a, b) => a.level - b.level);
        const fixedIds = new Set<number>();
        for (const lvl of [1, 2, 3, 4, 5] as MaturityLevel[]) {
          const atLevel = checks.filter((c) => c.level === lvl && !c.skipped);
          const missing = Math.max(0, Math.ceil(atLevel.length * 0.8) - atLevel.filter((c) => c.pass).length);
          for (const c of order.filter((o) => o.level === lvl).slice(0, missing)) fixedIds.add(c.i);
        }
        expect(fixedIds.size).toBe(next.remaining);
        const fixed = checks.map((c, i) => (fixedIds.has(i) ? { ...c, pass: true } : c));
        expect(score(fixed).level).toBeGreaterThanOrEqual(next.nextLevel as number);
      }),
    );
  });

  test("failing level 1 checks count toward the next level", () => {
    const checks: Check[] = [
      { level: 1, pass: false, skipped: false },
      { level: 1, pass: true, skipped: false },
      { level: 2, pass: true, skipped: false },
    ];
    expect(score(checks)).toMatchObject({ level: 1, nextLevelProgress: { nextLevel: 2, remaining: 1 } });
  });
});

describe("calculateLevel next level", () => {
  test("no next level when every check above the current level is N/A", () => {
    const checks: Check[] = [1, 2, 3, 4].map((level) => ({ level: level as MaturityLevel, pass: true, skipped: false }));
    checks.push({ level: 5, pass: false, skipped: true });
    const result = score(checks);
    expect(result.level).toBe(4);
    expect(result.nextLevelProgress.nextLevel).toBeNull();
  });

  test("a next level with checks left is still offered", () => {
    const checks: Check[] = [1, 2, 3, 4].map((level) => ({ level: level as MaturityLevel, pass: true, skipped: false }));
    checks.push({ level: 5, pass: false, skipped: false });
    expect(score(checks).nextLevelProgress.nextLevel).toBe(5);
  });
});
