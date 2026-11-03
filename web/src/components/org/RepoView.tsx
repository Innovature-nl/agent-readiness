import type { MaturityLevel, OrgRepoSummary, OrgSummary } from "../../types";
import { LEVEL_LABELS } from "../../types";
import { Card, CriteriaBar, Delta, FixItem, Hint, LevelBadge, Legend, nextLevelPlan, repoResult } from "./shared";

interface Props {
  data: OrgSummary;
  repo: OrgRepoSummary;
  onBack: () => void;
}

export default function RepoView({ data, repo, onBack }: Props) {
  const plan = nextLevelPlan(repo, data.criteria);
  const target = Math.min(repo.level + 1, 5) as MaturityLevel;

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <button type="button" onClick={onBack} className="text-sm text-accent hover:text-accent-light">
        &larr; All repositories
      </button>

      <Card
        title={repo.repoName}
        right={<span className="text-xs text-gray-500">Last scan {repo.timestamp.slice(0, 10)}</span>}
      >
        <div className="flex flex-wrap items-center gap-4 mb-4">
          <LevelBadge level={repo.level} />
          <span className="text-sm text-gray-300">{repo.percentage}% of all checks pass</span>
          <span className="text-sm text-gray-400">
            Since previous scan: <Delta value={repo.levelDelta} /> level, <Delta value={repo.percentageDelta} suffix="%" />
          </span>
        </div>
        <CriteriaBar criteria={data.criteria} rate={(c) => {
          const r = repoResult(repo, c.id);
          return r === null ? null : r ? 1 : 0;
        }} />
        <Legend />
      </Card>

      <Card title={plan.length ? `How to reach level ${target} (${LEVEL_LABELS[target]})` : "Next level"}>
        {plan.length === 0 ? (
          <p className="text-sm text-gray-300">
            {repo.level === 5 ? "This repository is at the highest level." : "Every requirement is met; the next scan should show the new level."}
          </p>
        ) : (
          <>
            <Hint>
              A level counts once 80% of its checks pass and every level below it does too. Fix the items below, starting at the lowest level,
              then scan again.
            </Hint>
            {plan.map((step) => (
              <div key={step.level} className="mb-6 last:mb-0">
                <h3 className="text-sm text-white font-semibold">
                  Level {step.level}: {step.passing} of {step.total} checks pass, fix at least {step.missing} more
                </h3>
                <ul>
                  {step.failing.map((c) => (
                    <FixItem key={c.id} c={c} />
                  ))}
                </ul>
              </div>
            ))}
          </>
        )}
      </Card>

      <Card title="All checks">
        <Hint>N/A means the check did not run: it needs --ai, or it was turned off in .kodus-readiness.yml.</Hint>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {data.pillars.map((p) => (
            <div key={p.id}>
              <h3 className="text-sm font-semibold text-gray-300 mb-2">{p.name}</h3>
              <ul className="space-y-1">
                {data.criteria
                  .filter((c) => c.pillarId === p.id)
                  .map((c) => {
                    const r = repoResult(repo, c.id);
                    return (
                      <li key={c.id} className="flex items-center justify-between text-sm" title={c.fix}>
                        <span className="text-gray-300">
                          <span className="text-gray-500 mr-2">L{c.level}</span>
                          {c.name}
                        </span>
                        <span className={r === null ? "text-gray-500" : r ? "text-pass" : "text-fail"}>
                          {r === null ? "N/A" : r ? "pass" : "fail"}
                        </span>
                      </li>
                    );
                  })}
              </ul>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
