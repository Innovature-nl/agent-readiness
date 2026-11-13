import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import type { Criterion } from "../types/index.js";

// Checks that ask whether the codebase itself stops an agent from repeating a mistake,
// instead of asking it in prose. After Lauren Tan, "All Code Is Slop (Except Mine)",
// AI Engineer Code Summit 2026.

const IGNORE = ["**/node_modules/**", "**/vendor/**", "**/.git/**", "**/dist/**", "**/build/**", "**/target/**", "**/gen/**", "**/generated/**"];

const SOURCE = "**/*.{ts,tsx,js,jsx,mjs,cjs,go,py,php,rb,kt,kts,java,cs,rs,swift}";

// shortcut: a sample, not every file; enough for a density on large monorepos.
const MAX_FILES = 5000;

const SUPPRESSION =
  /eslint-disable|biome-ignore|oxlint-disable|@ts-ignore|@ts-nocheck|\/\/\s*nolint|#\s*noqa|#\s*type:\s*ignore|pylint:\s*disable|@phpstan-ignore|@psalm-suppress|phpcs:ignore|@Suppress\(|@SuppressWarnings|#\[allow\(|rubocop:disable|swiftlint:disable|#pragma warning disable/;

/** Inline lint suppressions per 1,000 lines above this fail the check. */
export const SUPPRESSION_LIMIT = 1;

async function readAll(repoPath: string, files: string[]): Promise<string[]> {
  return Promise.all(files.map((f) => readFile(join(repoPath, f), "utf-8").catch(() => "")));
}

const lintSuppressions: Criterion = {
  id: "lint-suppressions",
  name: "Few lint suppressions",
  description: `At most ${SUPPRESSION_LIMIT} inline lint suppression (eslint-disable, //nolint, # noqa, @ts-ignore and the like) per 1,000 lines of code.`,
  pillarId: "style-linting",
  level: 3,
  requiresLLM: false,
  check: async (repoPath) => {
    const files = (await fg(SOURCE, { cwd: repoPath, ignore: IGNORE, dot: false })).slice(0, MAX_FILES);
    let lines = 0;
    let suppressed = 0;
    for (const text of await readAll(repoPath, files)) {
      for (const line of text.split("\n")) {
        lines++;
        if (SUPPRESSION.test(line)) suppressed++;
      }
    }
    if (lines === 0) {
      return { criterionId: "lint-suppressions", pass: true, message: "No source files to check." };
    }
    const perK = (suppressed / lines) * 1000;
    const message = `${suppressed} inline suppressions in ${lines.toLocaleString("en-US")} lines (${perK.toFixed(2)} per 1,000).`;
    if (perK <= SUPPRESSION_LIMIT) {
      return { criterionId: "lint-suppressions", pass: true, message };
    }
    return {
      criterionId: "lint-suppressions",
      pass: false,
      message,
      details:
        "Every suppression is an escape hatch an agent copies as the local pattern. Fix the root cause, or require a reason per suppression (golangci nolintlint, eslint-comments/require-description) and let the count only go down.",
    };
  },
};

// Linter settings that only exist to encode a project's own lessons.
const CUSTOM_RULE_FILES = [
  "**/.golangci.{yml,yaml,toml,json}",
  "**/{eslint.config.*,.eslintrc,.eslintrc.*}",
  "**/biome.{json,jsonc}",
  "**/{pyproject.toml,ruff.toml,.ruff.toml}",
  "**/phpstan.neon{,.dist}",
  "**/{detekt.yml,.detekt.yml,detekt-config.yml}",
  "**/.rubocop.yml",
];
const CUSTOM_RULE =
  /\b(forbidigo|depguard|gomodguard|ruleguard|no-restricted-(imports|syntax|globals|properties|modules)|noRestricted(Imports|Globals|Elements)|banned-api|banned-module-level-imports|disallowed(Function|Method|Static)Calls|Forbidden(MethodCall|Import))\b|\.grit\b|rulesdir|eslint-plugin-local/;

const customLintRules: Criterion = {
  id: "custom-lint-rules",
  name: "Project-specific lint rules",
  description:
    "The linter carries rules of the project's own, such as banned calls or imports (forbidigo, depguard, no-restricted-imports, Biome noRestrictedImports, ruff banned-api, Semgrep).",
  pillarId: "style-linting",
  level: 4,
  requiresLLM: false,
  check: async (repoPath) => {
    const [semgrep] = await fg(["**/.semgrep.{yml,yaml}", "**/.semgrep/**/*.{yml,yaml}"], { cwd: repoPath, ignore: IGNORE, dot: true, deep: 5 });
    if (semgrep) {
      return { criterionId: "custom-lint-rules", pass: true, message: `Semgrep rules found: ${semgrep}` };
    }
    const configs = await fg(CUSTOM_RULE_FILES, { cwd: repoPath, ignore: IGNORE, dot: true, deep: 4 });
    const texts = await readAll(repoPath, configs);
    for (const [i, text] of texts.entries()) {
      const hit = text.match(CUSTOM_RULE);
      if (hit) {
        return { criterionId: "custom-lint-rules", pass: true, message: `${hit[0]} in ${configs[i]}` };
      }
    }
    return {
      criterionId: "custom-lint-rules",
      pass: false,
      message: "No project-specific lint rules found.",
      details:
        "Whenever you correct an agent, turn the correction into a check: ban the call or import with forbidigo, depguard, no-restricted-imports, Biome noRestrictedImports, ruff banned-api or a Semgrep rule, with a message that points to the right way. A rule enforces; a line in AGENTS.md only asks.",
    };
  },
};

// Manifest entries and files that mean property-based, fuzz or formal verification.
const VERIFICATION_DEPS =
  /fast-check|@fast-check\/|\bhypothesis\b|atheris|pgregory\.net\/rapid|leanovate\/gopter|\bproptest\b|\bquickcheck\b|\bbolero\b|jqwik|kotest-property|FsCheck|CsCheck|giorgiosironi\/eris|\brantly\b|propcheck/;
const VERIFICATION_MANIFESTS = "**/{package.json,go.mod,Cargo.toml,pyproject.toml,requirements*.txt,build.gradle,build.gradle.kts,pom.xml,*.csproj,composer.json,Gemfile}";

const verification: Criterion = {
  id: "property-or-formal-verification",
  name: "Property-based, fuzz or formal verification",
  description:
    "Beyond example tests: property-based tests (fast-check, Hypothesis, rapid, proptest, jqwik), fuzz tests, or formal models (TLA+, Lean, Alloy, Dafny).",
  pillarId: "testing",
  level: 5,
  requiresLLM: false,
  check: async (repoPath) => {
    const [formal] = await fg(["**/*.{tla,als,dfy}", "**/lakefile.{lean,toml}"], { cwd: repoPath, ignore: IGNORE, deep: 6 });
    if (formal) {
      return { criterionId: "property-or-formal-verification", pass: true, message: `Formal verification found: ${formal}` };
    }
    const manifests = await fg(VERIFICATION_MANIFESTS, { cwd: repoPath, ignore: IGNORE, deep: 4 });
    for (const [i, text] of (await readAll(repoPath, manifests)).entries()) {
      const hit = text.match(VERIFICATION_DEPS);
      if (hit) {
        return { criterionId: "property-or-formal-verification", pass: true, message: `${hit[0]} in ${manifests[i]}` };
      }
    }
    const [fuzzDir] = await fg(["**/fuzz/Cargo.toml"], { cwd: repoPath, ignore: IGNORE, deep: 5 });
    if (fuzzDir) {
      return { criterionId: "property-or-formal-verification", pass: true, message: `cargo-fuzz found: ${fuzzDir}` };
    }
    const goTests = (await fg("**/*_test.go", { cwd: repoPath, ignore: IGNORE })).slice(0, MAX_FILES);
    for (const [i, text] of (await readAll(repoPath, goTests)).entries()) {
      if (/^func Fuzz[A-Z_]\w*\(/m.test(text) || text.includes('"testing/quick"')) {
        return { criterionId: "property-or-formal-verification", pass: true, message: `Go fuzz or property test in ${goTests[i]}` };
      }
    }
    return {
      criterionId: "property-or-formal-verification",
      pass: false,
      message: "No property-based, fuzz or formal verification found.",
      details:
        "Agents make these cheap to write and maintain. Add property-based tests (fast-check, Hypothesis, rapid, proptest), Go fuzz tests, or a TLA+ model of a critical flow, so an agent's change is checked against invariants and not only against the examples it saw.",
    };
  },
};

export const guardrailStyleCriteria: Criterion[] = [lintSuppressions, customLintRules];
export const guardrailTestingCriteria: Criterion[] = [verification];
