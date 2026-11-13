import { describe, test, expect, afterEach } from "bun:test";
import styleLinting from "../../src/pillars/style-linting.js";
import testing from "../../src/pillars/testing.js";
import documentation from "../../src/pillars/documentation.js";
import codeHealth from "../../src/pillars/code-health.js";
import type { LLMClient } from "../../src/types/index.js";
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
const runtime = getCheck(testing, "runtime-verification");
const enforced = getCheck(documentation, "enforced-agent-rules");
const info = mockProjectInfo({ detectedTypes: ["go"] });

const lines = (n: number) => Array.from({ length: n }, (_, i) => `x := ${i}`).join("\n");

describe("lint-suppressions", () => {
  test("passes at one unexplained suppression in 1,000 lines", async () => {
    const dir = await make("supp-ok", { "main.go": `${lines(999)}\nf() //nolint:errcheck` });
    const r = await suppressions(dir, info);
    expect(r.pass).toBe(true);
    expect(r.message).toContain("1 of 1 inline suppressions without a reason");
  });

  test("a suppression with a reason does not count", async () => {
    const dir = await make("supp-reason", {
      "main.go": `${lines(100)}\nf() //nolint:errcheck // the response is already written`,
      "web/a.ts": "// eslint-disable-next-line no-console -- the CLI prints on purpose\nconsole.log(1);\n// biome-ignore lint/style/noNonNullAssertion: set in the constructor\nx!.y();",
      "tool.py": "import os  # noqa: F401 re-exported for the plugin API",
    });
    const r = await suppressions(dir, info);
    expect(r.pass).toBe(true);
    expect(r.message).toContain("0 of 4 inline suppressions without a reason");
  });

  test("fails above one per 1,000 lines, across languages", async () => {
    const dir = await make("supp-bad", {
      "main.go": `${lines(500)}\nf() //nolint`,
      "web/app.ts": "// eslint-disable-next-line\nconst a = 1;\n// @ts-ignore\nconst b = 2;",
      "tool.py": "import os  # noqa: F401",
    });
    const r = await suppressions(dir, info);
    expect(r.pass).toBe(false);
    expect(r.message).toContain("4 of 4 inline suppressions without a reason");
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

describe("runtime-verification", () => {
  test("a verify skill with a feature map passes", async () => {
    const dir = await make("rv-skill", {
      ".claude/skills/verify-web/SKILL.md": "---\nname: verify-web\n---",
      ".claude/skills/verify-web/features/README.md": "# Features",
    });
    const r = await runtime(dir, info);
    expect(r.pass).toBe(true);
    expect(r.message).toContain("feature map");
  });

  test("a Cursor verification skill in a nested app passes", async () => {
    const dir = await make("rv-cursor", { "apps/desktop/.cursor/skills/verify-desktop/SKILL.md": "x" });
    expect((await runtime(dir, info)).pass).toBe(true);
  });

  test("other skills only fail", async () => {
    const dir = await make("rv-none", { ".claude/skills/release/SKILL.md": "x", "e2e/login.spec.ts": "x" });
    const r = await runtime(dir, info);
    expect(r.pass).toBe(false);
    expect(r.details).toContain("feature map");
  });
});

describe("enforced-agent-rules", () => {
  const llm = (pass: boolean): LLMClient => ({
    evaluate: async (_q: string, ctx: string) => ({ criterionId: "", pass, message: ctx.includes("AGENTS.md") ? "seen" : "missing" }),
  });

  test("asks the model about the agent instruction files", async () => {
    const dir = await make("ear-yes", { "AGENTS.md": "| Rule | Enforced by |\n|---|---|\n| no time.Sleep | forbidigo |" });
    const r = await enforced(dir, info, llm(true));
    expect(r.criterionId).toBe("enforced-agent-rules");
    expect(r.pass).toBe(true);
    expect(r.message).toBe("seen");
  });

  test("fails without agent instruction files", async () => {
    const dir = await make("ear-none", { "README.md": "# x" });
    expect((await enforced(dir, info, llm(true))).pass).toBe(false);
  });
});

describe("comment-density", () => {
  const density = getCheck(codeHealth, "comment-density");
  const code = (n: number) => Array.from({ length: n }, (_, i) => `\tx${i} := ${i}`).join("\n");

  test("passes under 10% and ignores the file header", async () => {
    const dir = await make("cd-ok", {
      "main.go": `// Copyright 2026\n// License: MIT\npackage main\n${code(95)}\n// one\n// two\n// three\n// four\n// five`,
    });
    const r = await density(dir, info);
    expect(r.pass).toBe(true);
    expect(r.message).toContain("5 comment lines");
  });

  test("fails above 10% and names the worst files", async () => {
    const dir = await make("cd-bad", {
      "a.go": `package a\n${code(10)}\n${"// why\n".repeat(8)}`,
      "b.py": `x = 1\n${"# because\n".repeat(3)}y = 2`,
      "c.ts": "const a = 1;\n/* block\n * of\n */\nconst b = 2;",
    });
    const r = await density(dir, info);
    expect(r.pass).toBe(false);
    expect(r.details).toContain("a.go (8)");
  });
});

describe("workaround-comments", () => {
  const workaround = getCheck(codeHealth, "workaround-comments");

  test("passes without justification comments", async () => {
    const dir = await make("wc-ok", { "main.go": `package main\n${lines(100)}\n// Retry: the provider drops one in fifty requests.` });
    expect((await workaround(dir, info)).pass).toBe(true);
  });

  test("fails above one per 1,000 lines and names the files", async () => {
    const dir = await make("wc-bad", {
      "ui.ts": "// workaround for a flicker, it would be a larger change\nsetTimeout(f, 0);\n// temporary: release later, in case it comes back\nsetTimeout(g, 0);",
      "x.go": "package x\n// for now we ignore the error\nvar a = 1",
    });
    const r = await workaround(dir, info);
    expect(r.pass).toBe(false);
    expect(r.message).toContain("3 workaround comments");
    expect(r.details).toContain("ui.ts (2)");
  });

  test("does not count words in code", async () => {
    const dir = await make("wc-code", { "x.ts": `const forNow = workaround(hack);\n${lines(10)}` });
    expect((await workaround(dir, info)).pass).toBe(true);
  });
});
