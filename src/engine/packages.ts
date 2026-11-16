import path from "node:path";
import type { CriterionResult, PackageScore, Pillar } from "../types/index.js";
import { AnalysisEngine } from "./analyzer.js";
import { detectProject } from "./detector.js";

/**
 * Criteria that say something about a single app or package in a monorepo. Everything else
 * (CI, CODEOWNERS, security policy, ...) is about the repository and is scored once.
 */
export const PACKAGE_CRITERIA = new Set(["linter", "formatter", "type-checker", "test-framework", "test-script", "test-files-exist"]);

/** A root config for these usually covers every workspace, so a package without its own still passes. */
const INHERITED_FROM_ROOT = new Set(["linter", "formatter", "type-checker", "test-framework", "test-script"]);

/**
 * Scores the package-scoped criteria for each package of a monorepo. A package passes a
 * criterion with its own config, or for the inheritable ones when the repository root passes it.
 */
export async function analyzePackages(
  pillars: Pillar[],
  repoPath: string,
  packages: string[],
  rootResults: Map<string, CriterionResult[]>,
): Promise<PackageScore[]> {
  const packagePillars = pillars
    .map((p) => ({ ...p, criteria: p.criteria.filter((c) => PACKAGE_CRITERIA.has(c.id)) }))
    .filter((p) => p.criteria.length > 0);
  if (packagePillars.length === 0) return [];

  const rootPassed = new Set(
    [...rootResults.values()]
      .flat()
      .filter((r) => r.pass)
      .map((r) => r.criterionId),
  );

  const scores: PackageScore[] = [];
  for (const pkg of packages) {
    const pkgPath = path.join(repoPath, pkg);
    const projectInfo = await detectProject(pkgPath);
    const results = [...(await new AnalysisEngine(packagePillars, pkgPath, projectInfo).run()).values()]
      .flat()
      .map((r) =>
        !r.pass && !r.skipped && INHERITED_FROM_ROOT.has(r.criterionId) && rootPassed.has(r.criterionId)
          ? { ...r, pass: true, message: "Inherited from the repository root" }
          : r,
      );
    const counted = results.filter((r) => !r.skipped);
    const passed = counted.filter((r) => r.pass).length;
    scores.push({
      path: pkg,
      passed,
      total: counted.length,
      percentage: counted.length > 0 ? Math.round((passed / counted.length) * 100) : 0,
      results,
    });
  }
  return scores;
}

/** Per criterion: how many packages pass it, e.g. "3/4 packages have a linter". */
export function summarizePackages(scores: PackageScore[]): Array<{ criterionId: string; passed: number; total: number }> {
  const byCriterion = new Map<string, { passed: number; total: number }>();
  for (const s of scores) {
    for (const r of s.results) {
      if (r.skipped) continue;
      const entry = byCriterion.get(r.criterionId) ?? { passed: 0, total: 0 };
      entry.total++;
      if (r.pass) entry.passed++;
      byCriterion.set(r.criterionId, entry);
    }
  }
  return [...byCriterion].map(([criterionId, v]) => ({ criterionId, ...v }));
}
