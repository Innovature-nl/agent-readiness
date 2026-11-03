import type { ReactNode } from "react";
import type { CriterionInfo, MaturityLevel, OrgRepoSummary } from "../../types";
import { LEVEL_LABELS } from "../../types";

export const LEVELS: MaturityLevel[] = [1, 2, 3, 4, 5];
export const THRESHOLD = 0.8;

/** Plain-language meaning of each level, derived from the criteria assigned to it. */
export const LEVEL_INFO: Record<MaturityLevel, string> = {
  1: "The basics an agent needs to find its way: a README, a lock file, an .editorconfig and a license.",
  2: "The agent can check its own work: linter, formatter, tests that run with one command, CI, a setup script and documented environment variables.",
  3: "Mistakes are caught early: type checking, pre-commit hooks, CI that runs tests and linters, an AGENTS.md or CLAUDE.md, CODEOWNERS and dependency updates.",
  4: "Changes ship safely: coverage, end-to-end tests, a deploy pipeline, branch protection, security and secret scanning, architecture docs.",
  5: "Bundle analysis, plus quality checks that need an AI judge and only run with --ai: naming, test quality, README quality and how agent-friendly the docs are.",
};

export const TOOLTIP_STYLE = {
  backgroundColor: "#1a1a25",
  border: "1px solid #2a2a3a",
  borderRadius: "8px",
  color: "#e5e7eb",
  fontSize: "12px",
};

export function rateClass(rate: number | null): string {
  if (rate === null) return "bg-surface-elevated";
  if (rate >= THRESHOLD) return "bg-pass";
  if (rate >= 0.5) return "bg-accent";
  return "bg-fail";
}

export function Card({ title, right, children }: { title: string; right?: ReactNode; children: ReactNode }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-6">
      <div className="flex items-center justify-between mb-4 gap-4">
        <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider">{title}</h2>
        {right}
      </div>
      {children}
    </div>
  );
}

export function Hint({ children }: { children: ReactNode }) {
  return <p className="text-xs text-gray-500 -mt-2 mb-4 leading-relaxed">{children}</p>;
}

export function LevelBadge({ level }: { level: number }) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-accent/40 bg-accent/10 text-accent text-xs font-bold">
      L{level}
      <span className="font-medium text-accent-light">{LEVEL_LABELS[level as MaturityLevel] ?? ""}</span>
    </span>
  );
}

export function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-gray-500">new</span>;
  if (value > 0) return <span className="text-pass">+{value}{suffix}</span>;
  if (value < 0) return <span className="text-fail">{value}{suffix}</span>;
  return <span className="text-gray-500">0{suffix}</span>;
}

export function sortByLevel(criteria: CriterionInfo[]): CriterionInfo[] {
  return [...criteria].sort((a, b) => a.level - b.level);
}

/**
 * One segment per criterion, ordered by level, coloured by pass rate (null = not evaluated).
 * Mirrors Factory's criteria bar: the level boundaries are marked underneath.
 */
export function CriteriaBar({ criteria, rate }: { criteria: CriterionInfo[]; rate: (c: CriterionInfo) => number | null }) {
  const sorted = sortByLevel(criteria);
  return (
    <div>
      <div className="flex gap-px h-8">
        {sorted.map((c) => {
          const r = rate(c);
          return (
            <div
              key={c.id}
              className={`flex-1 rounded-sm ${rateClass(r)}`}
              title={`L${c.level} ${c.name}: ${r === null ? "not evaluated" : `${Math.round(r * 100)}% pass`}`}
            />
          );
        })}
      </div>
      <div className="flex mt-1">
        {LEVELS.map((l) => {
          const count = sorted.filter((c) => c.level === l).length;
          return (
            <div key={l} style={{ flexGrow: count }} className="text-[11px] text-gray-500 border-l border-surface-border pl-1">
              Level {l}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Legend() {
  return (
    <div className="flex flex-wrap gap-4 text-xs text-gray-400 mt-3">
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-pass" /> passes (80%+)</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-accent" /> partly (50-79%)</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-fail" /> fails (under 50%)</span>
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-surface-elevated border border-surface-border" /> not evaluated</span>
    </div>
  );
}

/** Pass state of one criterion in one repo: true, false, or null when skipped. */
export function repoResult(repo: OrgRepoSummary, id: string): boolean | null {
  if (repo.passed.includes(id)) return true;
  if (repo.failed.includes(id)) return false;
  return null;
}

/**
 * What stands between a repo and its next level. A level counts once 80% of its evaluated
 * criteria pass and every level below it does too, so lower levels come first.
 */
export function nextLevelPlan(repo: OrgRepoSummary, criteria: CriterionInfo[]) {
  const target = Math.min(repo.level + 1, 5);
  return LEVELS.filter((l) => l <= target)
    .map((level) => {
      const atLevel = criteria.filter((c) => c.level === level && repoResult(repo, c.id) !== null);
      const passing = atLevel.filter((c) => repoResult(repo, c.id)).length;
      const needed = Math.ceil(atLevel.length * THRESHOLD);
      return {
        level,
        passing,
        total: atLevel.length,
        missing: Math.max(0, needed - passing),
        failing: atLevel.filter((c) => repoResult(repo, c.id) === false),
      };
    })
    .filter((step) => step.missing > 0);
}

export function FixItem({ c, extra }: { c: CriterionInfo; extra?: ReactNode }) {
  return (
    <li className="py-3 border-b border-surface-border/50 last:border-0">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-white font-medium">{c.name}</span>
        <LevelBadge level={c.level} />
        <span className="text-xs text-gray-500">effort: {c.effort}</span>
        {extra}
      </div>
      <p className="text-sm text-gray-300 mt-1">{c.fix}</p>
      {c.why && <p className="text-xs text-gray-500 mt-0.5">Why: {c.why}</p>}
    </li>
  );
}
