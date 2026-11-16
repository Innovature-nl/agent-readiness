import { afterEach, describe, expect, test } from "bun:test";
import { AnalysisEngine } from "../../src/engine/analyzer.js";
import { detectProject } from "../../src/engine/detector.js";
import { analyzePackages, summarizePackages } from "../../src/engine/packages.js";
import { ALL_PILLARS } from "../../src/pillars/index.js";
import { cleanup, createTestDir, writeFixtures } from "../helpers.js";

let dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

async function scan(fixtures: Record<string, string>) {
  const dir = await createTestDir("packages");
  dirs.push(dir);
  await writeFixtures(dir, fixtures);
  const info = await detectProject(dir);
  const rootResults = await new AnalysisEngine(ALL_PILLARS, dir, info).run();
  return { info, scores: await analyzePackages(ALL_PILLARS, dir, info.packages, rootResults) };
}

const result = (scores: Awaited<ReturnType<typeof scan>>["scores"], pkg: string, id: string) =>
  scores.find((s) => s.path === pkg)?.results.find((r) => r.criterionId === id);

describe("analyzePackages", () => {
  test("scores each workspace package on the package-scoped criteria only", async () => {
    const { info, scores } = await scan({
      "package.json": JSON.stringify({ workspaces: ["packages/*"] }),
      "packages/a/package.json": JSON.stringify({ name: "a", scripts: { test: "bun test" } }),
      "packages/a/eslint.config.js": "export default [];",
      "packages/a/src/a.test.ts": "",
      "packages/b/package.json": JSON.stringify({ name: "b" }),
    });
    expect(info.packages.sort()).toEqual(["packages/a", "packages/b"]);
    expect(scores.map((s) => s.path).sort()).toEqual(["packages/a", "packages/b"]);
    expect(scores[0].results.map((r) => r.criterionId).sort()).toEqual(
      ["formatter", "linter", "test-files-exist", "test-framework", "test-script", "type-checker"].sort(),
    );
    expect(result(scores, "packages/a", "linter")?.pass).toBe(true);
    expect(result(scores, "packages/b", "linter")?.pass).toBe(false);
    expect(result(scores, "packages/a", "test-files-exist")?.pass).toBe(true);
    expect(result(scores, "packages/b", "test-files-exist")?.pass).toBe(false);

    const linter = summarizePackages(scores).find((c) => c.criterionId === "linter");
    expect(linter).toEqual({ criterionId: "linter", passed: 1, total: 2 });
  });

  test("a root config covers packages, but root test files do not", async () => {
    const { scores } = await scan({
      "package.json": JSON.stringify({ workspaces: ["packages/*"], scripts: { test: "bun test" } }),
      "eslint.config.js": "export default [];",
      "packages/a/package.json": JSON.stringify({ name: "a" }),
      "packages/b/package.json": JSON.stringify({ name: "b" }),
      "packages/b/b.test.ts": "",
    });
    expect(result(scores, "packages/a", "linter")).toMatchObject({ pass: true, message: "Inherited from the repository root" });
    expect(result(scores, "packages/a", "test-script")?.pass).toBe(true);
    // The root passes test-files-exist only because of packages/b; packages/a still has none.
    expect(result(scores, "packages/a", "test-files-exist")?.pass).toBe(false);
    expect(result(scores, "packages/b", "test-files-exist")?.pass).toBe(true);
  });

  test("returns nothing when the package criteria are disabled", async () => {
    const pillars = ALL_PILLARS.map((p) => ({ ...p, criteria: p.criteria.filter((c) => c.id === "readme") }));
    expect(await analyzePackages(pillars, "/nonexistent", ["a"], new Map())).toEqual([]);
  });
});
