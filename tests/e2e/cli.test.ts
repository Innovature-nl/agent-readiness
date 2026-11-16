import { afterEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { cleanup, createTestDir, writeFixtures } from "../helpers.js";

// Runs the real CLI from source as a user would, against a small repository on disk.
const CLI = path.resolve(import.meta.dir, "../../src/index.ts");

async function cli(args: string[]) {
  const proc = Bun.spawn(["bun", CLI, ...args], { stdout: "pipe", stderr: "pipe", env: { ...process.env, NO_COLOR: "1" } });
  const [stdout, stderr, code] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text(), proc.exited]);
  return { stdout, stderr, code };
}

let dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

async function repo(name: string, fixtures: Record<string, string>) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  await writeFixtures(dir, fixtures);
  return dir;
}

const NODE_REPO = {
  "package.json": JSON.stringify({ name: "demo", scripts: { test: "bun test" } }),
  "bun.lock": "",
  "README.md": "# Demo\n\nA demo repository with enough text to count as a README with substance for the check.\n",
  "AGENTS.md": "# AGENTS.md\n",
  "src/index.ts": "export const x = 1;\n",
  "src/index.test.ts": "import { test } from 'bun:test';\ntest('x', () => {});\n",
};

describe("cli end to end", () => {
  test("--format json prints a report for the repository", async () => {
    const dir = await repo("e2e-json", NODE_REPO);
    const { stdout, code } = await cli([dir, "--format", "json", "--no-web"]);
    expect(code).toBe(0);
    const report = JSON.parse(stdout);
    expect(report.projectInfo.detectedTypes).toContain("node");
    expect(report.levelResult.level).toBeGreaterThanOrEqual(1);
    const aiContext = report.results.documentation.find((r: { criterionId: string }) => r.criterionId === "ai-context");
    expect(aiContext.pass).toBe(true);
  });

  test("--history stores a snapshot", async () => {
    const dir = await repo("e2e-history", NODE_REPO);
    const history = await repo("e2e-history-dir", {});
    const scan = await cli([dir, "--no-web", "--history", history, "--format", "json"]);
    expect(scan.code).toBe(0);
    const repos = fs.readdirSync(history);
    expect(repos).toHaveLength(1);
    expect(fs.readdirSync(path.join(history, repos[0])).some((f) => f.endsWith(".json"))).toBe(true);
  });

  test("--ci --min-level fails below the required level", async () => {
    const dir = await repo("e2e-ci", { "README.md": "# Empty" });
    const { code } = await cli([dir, "--ci", "--min-level", "5", "--no-web"]);
    expect(code).not.toBe(0);
  });
});
