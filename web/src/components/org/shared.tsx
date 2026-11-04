import type { ReactNode } from "react";
import type { CriterionInfo, MaturityLevel, OrgRepoSummary, OrgSummary } from "../../types";
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
export function CriteriaBar({
  criteria,
  rate,
  rateLabel = (r) => `passes in ${Math.round(r * 100)}% of repositories`,
  skipReason = () => "Not evaluated in any repository: it needs --ai, does not apply, or was turned off.",
}: {
  criteria: CriterionInfo[];
  rate: (c: CriterionInfo) => number | null;
  rateLabel?: (r: number, c: CriterionInfo) => string;
  /** Shown instead of the result when the check did not run. */
  skipReason?: (c: CriterionInfo) => string;
}) {
  const sorted = sortByLevel(criteria);
  return (
    <div>
      <div className="flex gap-px h-8">
        {sorted.map((c, i) => {
          const r = rate(c);
          // Keep the tooltip inside the card at both ends of the bar.
          const align = i < 4 ? "left-0" : i > sorted.length - 5 ? "right-0" : "left-1/2 -translate-x-1/2";
          return (
            <div key={c.id} tabIndex={0} aria-label={c.name} className={`group relative flex-1 rounded-sm outline-none ${rateClass(r)}`}>
              <div
                role="tooltip"
                className={`pointer-events-none absolute bottom-full mb-2 z-20 w-72 hidden group-hover:block group-focus:block ${align} rounded-lg border border-surface-border bg-surface-card p-3 shadow-xl`}
              >
                <div className="flex items-center gap-2">
                  <LevelBadge level={c.level} />
                  <span className="text-sm font-medium text-white">{c.name}</span>
                </div>
                <p className={`text-xs mt-1 ${r === null ? "text-gray-500" : r >= THRESHOLD ? "text-pass" : r >= 0.5 ? "text-accent" : "text-fail"}`}>
                  {r === null ? skipReason(c) : rateLabel(r, c)}
                </p>
                {r !== null && r < 1 && <p className="text-xs text-gray-400 mt-1">{c.fix}</p>}
              </div>
            </div>
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
      <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm bg-surface-elevated border border-surface-border" /> not evaluated (N/A, hover for why)</span>
    </div>
  );
}

/** Why a criterion did not run in a repo. Older snapshots carry no reason. */
export function skipReason(repo: OrgRepoSummary, id: string): string {
  return repo.skipped?.[id] ?? "Not evaluated: it needs --ai, does not apply here, or was turned off in .agent-readiness.yml.";
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

/** Same rule as the CLI: the average repository level, rounded down. */
function orgLevel(levels: number[]): number {
  return levels.length ? Math.floor(levels.reduce((sum, l) => sum + l, 0) / levels.length) : 0;
}

/** The summary restricted to some repositories, with the org level and trend recomputed for them. */
export function selectRepos(data: OrgSummary, include: (name: string) => boolean): OrgSummary {
  const repos = data.repos.filter((r) => include(r.repoName));
  const dates = [...new Set(repos.flatMap((r) => r.history.map((h) => h.date)))].sort();
  const trend = dates.map((date) => {
    const levels = repos.flatMap((r) => r.history.filter((h) => h.date <= date).slice(-1).map((h) => h.level));
    return { date, orgLevel: orgLevel(levels), repoCount: levels.length };
  });
  return { ...data, criteria: sortByLevel(data.criteria), repos, orgLevel: orgLevel(repos.map((r) => r.level)), trend };
}
