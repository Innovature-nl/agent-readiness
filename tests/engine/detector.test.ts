import { afterEach, describe, expect, test } from "bun:test";
import { detectProject } from "../../src/engine/detector.js";
import { cleanup, createTestDir, writeFixtures } from "../helpers.js";

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

// ---------------------------------------------------------------------------
// Empty directory
// ---------------------------------------------------------------------------
describe("detectProject", () => {
  test("empty dir returns no types", async () => {
    const dir = await make("empty");
    const info = await detectProject(dir);
    expect(info.detectedTypes).toEqual([]);
    expect(info.isMonorepo).toBe(false);
  });

  // -------------------------------------------------------------------------
  // New languages: C#, Ruby, PHP, Swift
  // -------------------------------------------------------------------------
  describe("new languages", () => {
    test("detects csharp via .csproj", async () => {
      const dir = await make("csharp-csproj", { "MyApp.csproj": "<Project />" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("csharp");
    });

    test("detects csharp via .sln", async () => {
      const dir = await make("csharp-sln", { "MyApp.sln": "Microsoft Visual Studio Solution File" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("csharp");
    });

    test("detects ruby via Gemfile", async () => {
      const dir = await make("ruby", { Gemfile: 'source "https://rubygems.org"' });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("ruby");
    });

    test("detects php via composer.json", async () => {
      const dir = await make("php", { "composer.json": '{"require":{}}' });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("php");
    });

    test("detects swift via Package.swift", async () => {
      const dir = await make("swift", { "Package.swift": "// swift-tools-version:5.9" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("swift");
    });
  });

  // -------------------------------------------------------------------------
  // Regression: existing languages
  // -------------------------------------------------------------------------
  describe("regression — existing languages", () => {
    test("detects node", async () => {
      const dir = await make("node", { "package.json": '{"name":"x"}' });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("node");
    });

    test("detects python", async () => {
      const dir = await make("python", { "pyproject.toml": "[project]" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("python");
    });

    test("detects go", async () => {
      const dir = await make("go", { "go.mod": "module example.com/foo" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("go");
    });

    test("detects rust", async () => {
      const dir = await make("rust", { "Cargo.toml": "[package]" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("rust");
    });

    test("detects kotlin via build.gradle.kts", async () => {
      const dir = await make("kotlin", { "build.gradle.kts": 'plugins { kotlin("jvm") }' });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("kotlin");
    });

    test("detects java via pom.xml", async () => {
      const dir = await make("java", { "pom.xml": "<project />" });
      const info = await detectProject(dir);
      expect(info.detectedTypes).toContain("java");
    });
  });

  // -------------------------------------------------------------------------
  // Multi-language
  // -------------------------------------------------------------------------
  test("multi-language: node + ruby", async () => {
    const dir = await make("multi", {
      "package.json": '{"name":"x"}',
      Gemfile: 'source "https://rubygems.org"',
    });
    const info = await detectProject(dir);
    expect(info.detectedTypes).toContain("node");
    expect(info.detectedTypes).toContain("ruby");
  });
});

describe("projects one directory down", () => {
  test("a service under an infra repository counts as a package", async () => {
    const dir = await make("nested-go", {
      "infra/main.tf": "terraform {}",
      "relay/go.mod": "module example.com/relay",
      "README.md": "# Infra",
    });
    const info = await detectProject(dir);
    expect(info.detectedTypes).toEqual(["go"]);
    expect(info.isMonorepo).toBe(true);
    expect(info.packages).toEqual(["relay"]);
  });

  test("ignores dependency and hidden directories", async () => {
    const dir = await make("nested-ignored", {
      "node_modules/x/package.json": "{}",
      ".github/package.json": "{}",
      "docs/index.md": "# Docs",
    });
    const info = await detectProject(dir);
    expect(info.detectedTypes).toEqual([]);
    expect(info.isMonorepo).toBe(false);
  });

  test("a root manifest wins, so nested directories are left to the monorepo rules", async () => {
    const dir = await make("nested-root", {
      "package.json": "{}",
      "tools/go.mod": "module example.com/tools",
    });
    const info = await detectProject(dir);
    expect(info.detectedTypes).toEqual(["node"]);
    expect(info.isMonorepo).toBe(false);
  });
});
