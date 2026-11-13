import fg from "fast-glob";
import type { ProjectInfo } from "../types/index.js";

/**
 * Checks that only make sense when the repository contains a software project, i.e. a
 * recognized manifest such as package.json, go.mod or composer.json. Docs vaults, infra
 * and deployment repositories get N/A for these instead of a fail.
 */
const CODE_ONLY = new Set([
  "lock-file",
  "linter",
  "formatter",
  "type-checker",
  "test-framework",
  "test-files-exist",
  "test-script",
  "env-documentation",
  "setup-script",
  "version-pinned",
  "containerization",
  "api-docs",
  "ci-runs-tests",
  "ci-runs-linters",
  "build-automated",
  "coverage-config",
  "e2e-tests",
  "dead-code-detection",
  "naming-conventions",
  "test-quality",
  "lint-suppressions",
  "custom-lint-rules",
  "property-or-formal-verification",
  "runtime-verification",
  "comment-density",
  "workaround-comments",
]);

const BUNDLER_CONFIGS = ["vite", "webpack", "next", "nuxt", "rollup", "astro", "svelte", "remix", "angular", "rsbuild"];

async function hasFrontendBundler(repoPath: string): Promise<boolean> {
  const configs = BUNDLER_CONFIGS.flatMap((b) => [`${b}.config.*`, `*/${b}.config.*`, `*/*/${b}.config.*`, `*/*/*/${b}.config.*`]);
  configs.push("angular.json", "*/angular.json", "*/*/angular.json");
  const found = await fg(configs, { cwd: repoPath, ignore: ["**/node_modules/**"], dot: false, deep: 4 });
  return found.length > 0;
}

/**
 * Returns why a criterion does not apply to this repository, or null when it does.
 * shortcut: a repo is a software project only with a manifest in its root; repos that keep
 * all code in subdirectories without a root manifest are treated as non-code.
 */
export async function notApplicableReason(criterionId: string, repoPath: string, projectInfo: ProjectInfo): Promise<string | null> {
  const isCode = projectInfo.detectedTypes.length > 0;
  if (CODE_ONLY.has(criterionId) && !isCode) {
    return "Not applicable: no software project manifest found (docs, infra or config repository).";
  }
  if (criterionId === "bundle-analysis" && !(await hasFrontendBundler(repoPath))) {
    return "Not applicable: no frontend bundler found.";
  }
  return null;
}
