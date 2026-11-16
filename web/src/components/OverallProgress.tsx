import type { CriterionInfo, MaturityLevel, ReportData } from "../types";
import { LEVEL_LABELS } from "../types";
import { CriteriaBar, LevelBadge } from "./org/shared";

interface Props {
  data: ReportData;
}

const LEVELS: MaturityLevel[] = [1, 2, 3, 4, 5];
const THRESHOLD = 0.8;

/** Every check with its result, and the fix text from its recommendation when it fails. */
function checks(data: ReportData) {
  return data.pillars.flatMap((p) =>
    p.criteria.map((c) => {
      const result = data.results[p.id]?.find((r) => r.criterionId === c.id);
      const rec = data.recommendations.find((r) => r.criterionId === c.id);
      const info: CriterionInfo = {
        id: c.id,
        name: c.name,
        pillarId: p.id,
        level: c.level as MaturityLevel,
        requiresLLM: c.requiresLLM,
        fix: rec?.description ?? "",
        why: rec?.reason ?? "",
        effort: rec?.effort ?? "",
      };
      return { info, result };
    }),
  );
}

export default function OverallProgress({ data }: Props) {
  const currentLevel = data.levelResult.level;
  const { pillarScores } = data;

  const totalPassed = pillarScores.reduce((sum, s) => sum + s.passed, 0);
  const totalCriteria = pillarScores.reduce((sum, s) => sum + s.total, 0);
  const overallPct = totalCriteria > 0 ? Math.round((totalPassed / totalCriteria) * 100) : 0;

  const { nextLevelProgress } = data.levelResult;
  const all = checks(data);
  const byId = new Map(all.map((c) => [c.info.id, c.result]));
  const passRate = (c: CriterionInfo) => {
    const r = byId.get(c.id);
    return !r || r.skipped ? null : r.pass ? 1 : 0;
  };

  // Same rule as the CLI: a level needs 80% of its checks, and every level below it as well.
  const next = nextLevelProgress.nextLevel;
  const blocking =
    next === null
      ? []
      : LEVELS.filter((l) => l <= next).flatMap((level) => {
          const atLevel = all.filter((c) => c.info.level === level && c.result && !c.result.skipped);
          const missing = Math.ceil(atLevel.length * THRESHOLD) - atLevel.filter((c) => c.result?.pass).length;
          return missing > 0 ? [{ level, missing, failing: atLevel.filter((c) => !c.result?.pass).map((c) => c.info) }] : [];
        });

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-6">
      {/* Overall percentage */}
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-400">Overall Score</span>
        <span className="text-sm font-semibold text-white">{overallPct}%</span>
      </div>

      {/* Progress bar */}
      <div className="relative h-3 bg-surface-elevated rounded-full overflow-hidden mb-4">
        <div
          className={`h-full rounded-full transition-all duration-700 ${
            overallPct >= 80
              ? "bg-pass"
              : overallPct >= 50
                ? "bg-accent"
                : "bg-fail"
          }`}
          style={{ width: `${overallPct}%` }}
        />
      </div>

      {/* Level markers */}
      <div className="flex items-center justify-between">
        {LEVELS.map((lvl) => {
          const isActive = lvl <= currentLevel;
          const isCurrent = lvl === currentLevel;
          return (
            <div key={lvl} className="flex flex-col items-center gap-1">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                  isCurrent
                    ? "bg-accent border-accent text-black"
                    : isActive
                      ? "bg-surface-elevated border-pass text-pass"
                      : "bg-surface-elevated border-surface-border text-gray-500"
                }`}
              >
                L{lvl}
              </div>
              <span
                className={`text-[10px] ${
                  isCurrent
                    ? "text-accent font-semibold"
                    : isActive
                      ? "text-gray-400"
                      : "text-gray-600"
                }`}
              >
                {LEVEL_LABELS[lvl]}
              </span>
            </div>
          );
        })}
      </div>

      {/* Next level hint */}
      {nextLevelProgress.nextLevel !== null && (
        <p className="text-xs text-gray-500 mt-3 text-center">
          {nextLevelProgress.remaining} more criteria to reach Level{" "}
          {nextLevelProgress.nextLevel}
        </p>
      )}
      {blocking.map((step) => (
        <div key={step.level} className="mt-3">
          <p className="text-xs text-gray-400 mb-2">
            Level {step.level}: fix {step.missing} of these
          </p>
          <div className="flex flex-wrap gap-2">
            {step.failing.map((c) => (
              <span
                key={c.id}
                title={c.fix || undefined}
                className="inline-flex items-center gap-2 text-xs px-2.5 py-1 rounded-full border border-fail/40 bg-fail/10 text-gray-200"
              >
                <LevelBadge level={c.level} />
                {c.name}
              </span>
            ))}
          </div>
        </div>
      ))}

      {/* One block per check, as in the organization view; hover for the result and the fix */}
      <div className="mt-6">
        <CriteriaBar
          criteria={all.map((c) => c.info)}
          rate={passRate}
          rateLabel={(r) => (r === 1 ? "passes" : "fails")}
          skipReason={(c) => byId.get(c.id)?.message || "Not evaluated"}
        />
      </div>
      {nextLevelProgress.nextLevel === null && (
        <p className="text-xs text-pass mt-3 text-center font-medium">
          Maximum level achieved!
        </p>
      )}
    </div>
  );
}
