import { describe, test, expect, afterEach } from "bun:test";
import { notApplicableReason } from "../../src/pillars/applicability.js";
import { calculateLevel } from "../../src/engine/scorer.js";
import type { CriterionResult, Pillar } from "../../src/types/index.js";
import { createTestDir, cleanup, writeFixtures, mockProjectInfo } from "../helpers.js";

let dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

describe("applicability", () => {
  test("code-only checks are N/A without a project manifest", async () => {
    const reason = await notApplicableReason("lock-file", "/nonexistent", mockProjectInfo({ detectedTypes: [] }));
    expect(reason).toContain("Not applicable");
    expect(await notApplicableReason("lock-file", "/nonexistent", mockProjectInfo({ detectedTypes: ["go"] }))).toBeNull();
    expect(await notApplicableReason("readme", "/nonexistent", mockProjectInfo({ detectedTypes: [] }))).toBeNull();
  });

  test("bundle analysis applies only with a frontend bundler", async () => {
    const dir = await createTestDir("applicability");
    dirs.push(dir);
    const info = mockProjectInfo({ detectedTypes: ["node"] });
    expect(await notApplicableReason("bundle-analysis", dir, info)).not.toBeNull();
    await writeFixtures(dir, { "frontend/web/vite.config.ts": "export default {}" });
    expect(await notApplicableReason("bundle-analysis", dir, info)).toBeNull();
  });

  test("an empty top level is not passed for free", () => {
    const criteria = [1, 2, 3, 4].map((level) => ({ id: `c${level}`, level, check: async () => ({}) }));
    const pillar = { id: "p", name: "P", criteria } as unknown as Pillar;
    const results = new Map<string, CriterionResult[]>([
      ["p", criteria.map((c) => ({ criterionId: c.id, pass: true, message: "" }))],
    ]);
    expect(calculateLevel([pillar], results).level).toBe(4);
  });
});
