import { describe, test, expect } from "bun:test";
import type { Pillar } from "../../src/types/index.js";
import { applyProfile, parseProfile } from "../../src/pillars/profiles.js";

const info = { languages: [], frameworks: [], packageManager: null, isMonorepo: false } as never;

function pillar(results: Record<string, boolean>): Pillar {
  return {
    id: "p",
    name: "P",
    criteria: Object.entries(results).map(([id, pass]) => ({
      id,
      name: id,
      description: id,
      pillarId: "p",
      level: 1,
      requiresLLM: false,
      check: async () => ({ criterionId: id, pass, message: id }),
    })),
  } as Pillar;
}

describe("profiles", () => {
  test("default leaves the pillars untouched", () => {
    const pillars = [pillar({ license: false })];
    expect(applyProfile(pillars, "default")).toBe(pillars);
  });

  test("internal drops open-source checks and accepts the alternative", async () => {
    const [p] = applyProfile([pillar({ license: false, "security-policy": false, contributing: false, "ai-context": true, editorconfig: false, formatter: false })], "internal");
    expect(p.criteria.map((c) => c.id)).toEqual(["contributing", "ai-context", "editorconfig", "formatter"]);

    const contributing = await p.criteria[0].check("/", info);
    expect(contributing).toMatchObject({ criterionId: "contributing", pass: true });
    expect((await p.criteria[2].check("/", info)).pass).toBe(false);
    expect(p.criteria[0].profileNote).toBeTruthy();
  });

  test("parseProfile rejects unknown names", () => {
    expect(parseProfile(undefined)).toBe("default");
    expect(() => parseProfile("public")).toThrow();
  });
});
