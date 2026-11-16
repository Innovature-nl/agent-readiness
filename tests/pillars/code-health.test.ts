import { afterEach, describe, expect, test } from "bun:test";
import codeHealth from "../../src/pillars/code-health.js";
import { cleanup, createTestDir, getCheck, mockProjectInfo, writeFixtures } from "../helpers.js";

let dirs: string[] = [];

async function make(name: string, fixtures: Record<string, string> = {}) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  if (Object.keys(fixtures).length > 0) {
    await writeFixtures(dir, fixtures);
  }
  return dir;
}

afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

const freshnessCheck = getCheck(codeHealth, "no-outdated-deps");
const deadCodeCheck = getCheck(codeHealth, "dead-code-detection");

// ---------------------------------------------------------------------------
// no-outdated-deps — new lock files recognized
// ---------------------------------------------------------------------------
describe("no-outdated-deps", () => {
  test("python: uv.lock (fresh)", async () => {
    const dir = await make("uv-fresh", { "uv.lock": "" });
    const r = await freshnessCheck(dir, mockProjectInfo({ detectedTypes: ["python"] }));
    expect(r.pass).toBe(true);
  });

  test("node: bun.lock (fresh)", async () => {
    const dir = await make("node-bun-fresh", { "bun.lock": "{}" });
    const r = await freshnessCheck(dir, mockProjectInfo({ detectedTypes: ["node"] }));
    expect(r.pass).toBe(true);
  });

  test("csharp: packages.lock.json (fresh)", async () => {
    const dir = await make("cs-fresh", { "packages.lock.json": "{}" });
    const r = await freshnessCheck(dir, mockProjectInfo({ detectedTypes: ["csharp"] }));
    expect(r.pass).toBe(true);
  });

  test("ruby: Gemfile.lock (fresh)", async () => {
    const dir = await make("rb-fresh", { "Gemfile.lock": "GEM\n  specs:" });
    const r = await freshnessCheck(dir, mockProjectInfo({ detectedTypes: ["ruby"] }));
    expect(r.pass).toBe(true);
  });

  test("php: composer.lock (fresh)", async () => {
    const dir = await make("php-fresh", { "composer.lock": '{"packages":[]}' });
    const r = await freshnessCheck(dir, mockProjectInfo({ detectedTypes: ["php"] }));
    expect(r.pass).toBe(true);
  });

  test("swift: Package.resolved (fresh)", async () => {
    const dir = await make("swift-fresh", { "Package.resolved": '{"pins":[]}' });
    const r = await freshnessCheck(dir, mockProjectInfo({ detectedTypes: ["swift"] }));
    expect(r.pass).toBe(true);
  });

  test("manifest without lock file fails", async () => {
    const dir = await make("no-lock", { "composer.json": '{"require":{}}' });
    const r = await freshnessCheck(dir, mockProjectInfo({ detectedTypes: ["php"] }));
    expect(r.pass).toBe(false);
  });

  test("empty dir skips", async () => {
    const dir = await make("fresh-empty");
    const r = await freshnessCheck(dir, mockProjectInfo());
    expect(r.skipped).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// dead-code-detection
// ---------------------------------------------------------------------------
describe("dead-code-detection", () => {
  test("go: golangci v2 default none with unused enabled", async () => {
    const dir = await make("go-unused-v2", {
      ".golangci.yml": 'version: "2"\nlinters:\n  default: none\n  enable:\n    - govet\n    - unused\n',
    });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["go"] }));
    expect(r.pass).toBe(true);
    expect(r.message).toContain(".golangci.yml");
  });

  test("go: golangci implicit defaults include unused", async () => {
    const dir = await make("go-unused-default", { ".golangci.yaml": "run:\n  timeout: 5m\n" });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["go"] }));
    expect(r.pass).toBe(true);
  });

  test("go: golangci json with unused enabled", async () => {
    const dir = await make("go-unused-json", {
      ".golangci.json": '{"linters":{"disable-all":true,"enable":["unused"]}}',
    });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["go"] }));
    expect(r.pass).toBe(true);
  });

  test("go: unused explicitly disabled fails", async () => {
    const dir = await make("go-unused-disabled", {
      ".golangci.yml": "linters:\n  disable:\n    - unused\n",
    });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["go"] }));
    expect(r.pass).toBe(false);
  });

  test("go: default none without unused fails", async () => {
    const dir = await make("go-unused-none", {
      ".golangci.yml": 'version: "2"\nlinters:\n  default: none\n  enable:\n    - govet\n',
    });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["go"] }));
    expect(r.pass).toBe(false);
  });

  test("go: v1 disable-all without unused fails", async () => {
    const dir = await make("go-unused-disable-all", {
      ".golangci.yml": "linters:\n  disable-all: true\n  enable:\n    - errcheck\n",
    });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["go"] }));
    expect(r.pass).toBe(false);
  });

  test("go: v2 fast preset fails", async () => {
    const dir = await make("go-unused-fast", {
      ".golangci.yml": 'version: "2"\nlinters:\n  default: fast\n',
    });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["go"] }));
    expect(r.pass).toBe(false);
  });

  test("go: invalid golangci yaml does not crash", async () => {
    const dir = await make("go-unused-broken", { ".golangci.yml": "linters: [unclosed" });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["go"] }));
    expect(r.pass).toBe(false);
  });

  test("csharp: Roslynator in .csproj", async () => {
    const dir = await make("cs-dead", {
      "App.csproj": '<PackageReference Include="Roslynator.Analyzers" />',
    });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["csharp"] }));
    expect(r.pass).toBe(true);
  });

  test("ruby: debride in Gemfile", async () => {
    const dir = await make("rb-dead-debride", { Gemfile: 'gem "debride"' });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["ruby"] }));
    expect(r.pass).toBe(true);
  });

  test("ruby: reek in Gemfile", async () => {
    const dir = await make("rb-dead-reek", { Gemfile: 'gem "reek"' });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["ruby"] }));
    expect(r.pass).toBe(true);
  });

  test("php: phpmd in composer.json", async () => {
    const dir = await make("php-dead", {
      "composer.json": '{"require-dev":{"phpmd/phpmd":"^2.0"}}',
    });
    const r = await deadCodeCheck(dir, mockProjectInfo({ detectedTypes: ["php"] }));
    expect(r.pass).toBe(true);
  });

  test("empty dir fails", async () => {
    const dir = await make("dead-empty");
    const r = await deadCodeCheck(dir, mockProjectInfo());
    expect(r.pass).toBe(false);
  });
});
