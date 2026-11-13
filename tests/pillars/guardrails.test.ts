import { describe, test, expect, afterEach } from "bun:test";
import styleLinting from "../../src/pillars/style-linting.js";
import testing from "../../src/pillars/testing.js";
import { createTestDir, cleanup, writeFixtures, mockProjectInfo, getCheck } from "../helpers.js";

let dirs: string[] = [];

async function make(name: string, fixtures: Record<string, string>) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  await writeFixtures(dir, fixtures);
  return dir;
}

afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

const suppressions = getCheck(styleLinting, "lint-suppressions");
const customRules = getCheck(styleLinting, "custom-lint-rules");
const verification = getCheck(testing, "property-or-formal-verification");
const info = mockProjectInfo({ detectedTypes: ["go"] });

const lines = (n: number) => Array.from({ length: n }, (_, i) => `x := ${i}`).join("\n");

describe("lint-suppressions", () => {
  test("passes at one suppression in 1,000 lines", async () => {
    const dir = await make("supp-ok", { "main.go": `${lines(999)}\nf() //nolint:errcheck // reason` });
    const r = await suppressions(dir, info);
    expect(r.pass).toBe(true);
    expect(r.message).toContain("1 inline suppressions");
  });

  test("fails above one per 1,000 lines, across languages", async () => {
    const dir = await make("supp-bad", {
      "main.go": `${lines(500)}\nf() //nolint`,
      "web/app.ts": "// eslint-disable-next-line\nconst a = 1;\n// @ts-ignore\nconst b = 2;",
      "tool.py": "import os  # noqa: F401",
    });
    const r = await suppressions(dir, info);
    expect(r.pass).toBe(false);
    expect(r.message).toContain("4 inline suppressions");
  });

  test("ignores vendored and generated code", async () => {
    const dir = await make("supp-vendor", {
      "main.go": lines(10),
      "vendor/x/x.go": "//nolint\n//nolint",
      "node_modules/y/y.js": "// eslint-disable",
    });
    expect((await suppressions(dir, info)).pass).toBe(true);
  });
});

describe("custom-lint-rules", () => {
  test("golangci forbidigo passes", async () => {
    const dir = await make("rules-go", { ".golangci.yml": "linters:\n  enable:\n    - forbidigo\n" });
    const r = await customRules(dir, info);
    expect(r.pass).toBe(true);
    expect(r.message).toContain("forbidigo");
  });

  test("eslint no-restricted-imports in a nested app passes", async () => {
    const dir = await make("rules-eslint", {
      "apps/web/eslint.config.js": 'export default [{ rules: { "no-restricted-imports": ["error", "lodash"] } }];',
    });
    expect((await customRules(dir, info)).pass).toBe(true);
  });

  test("a Semgrep rules directory passes", async () => {
    const dir = await make("rules-semgrep", { ".semgrep/no-sleep.yml": "rules: []" });
    expect((await customRules(dir, info)).pass).toBe(true);
  });

  test("a plain linter config fails", async () => {
    const dir = await make("rules-none", { ".golangci.yml": "linters:\n  enable:\n    - errcheck\n", "biome.json": "{}" });
    const r = await customRules(dir, info);
    expect(r.pass).toBe(false);
    expect(r.details).toContain("forbidigo");
  });
});

describe("property-or-formal-verification", () => {
  test("fast-check in package.json passes", async () => {
    const dir = await make("pbt-ts", { "package.json": '{"devDependencies":{"fast-check":"^3.0.0"}}' });
    expect((await verification(dir, info)).pass).toBe(true);
  });

  test("a Go fuzz test passes", async () => {
    const dir = await make("pbt-go", { "parse/parse_test.go": "package parse\n\nfunc FuzzParse(f *testing.F) {}\n" });
    const r = await verification(dir, info);
    expect(r.pass).toBe(true);
    expect(r.message).toContain("parse/parse_test.go");
  });

  test("a TLA+ model passes", async () => {
    const dir = await make("pbt-tla", { "specs/notifications.tla": "---- MODULE notifications ----" });
    expect((await verification(dir, info)).pass).toBe(true);
  });

  test("example tests only fail", async () => {
    const dir = await make("pbt-none", {
      "go.mod": "module x\n",
      "x_test.go": "package x\n\nfunc TestX(t *testing.T) {}\n",
    });
    expect((await verification(dir, info)).pass).toBe(false);
  });
});
