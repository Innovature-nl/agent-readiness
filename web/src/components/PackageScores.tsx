import type { PackageScore, SerializedPillar } from "../types";

interface Props {
  packageScores: PackageScore[];
  pillars: SerializedPillar[];
}

const barColor = (pct: number) => (pct >= 80 ? "bg-pass" : pct >= 50 ? "bg-accent" : "bg-fail");

export default function PackageScores({ packageScores, pillars }: Props) {
  if (packageScores.length === 0) return null;

  const name = (id: string) =>
    pillars.flatMap((p) => p.criteria).find((c) => c.id === id)?.name ?? id;

  // Per check: how many packages pass it, in the order the checks first appear.
  const summary = new Map<string, { passed: number; total: number }>();
  for (const s of packageScores) {
    for (const r of s.results) {
      if (r.skipped) continue;
      const entry = summary.get(r.criterionId) ?? { passed: 0, total: 0 };
      entry.total++;
      if (r.pass) entry.passed++;
      summary.set(r.criterionId, entry);
    }
  }

  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">
        Packages
      </h2>

      <div className="flex flex-wrap gap-2 mb-6">
        {[...summary].map(([id, { passed, total }]) => (
          <span
            key={id}
            className={`text-xs px-2.5 py-1 rounded-full border border-surface-border bg-surface-elevated ${
              passed === total ? "text-pass" : passed === 0 ? "text-fail" : "text-accent"
            }`}
          >
            <span className="font-semibold">
              {passed}/{total}
            </span>{" "}
            <span className="text-gray-300">{name(id)}</span>
          </span>
        ))}
      </div>

      <div className="space-y-3">
        {packageScores.map((s) => {
          const missing = s.results.filter((r) => !r.pass && !r.skipped);
          const inherited = s.results.filter((r) => r.pass && r.message.startsWith("Inherited"));
          return (
            <div key={s.path}>
              <div className="flex items-center justify-between gap-4 mb-1">
                <span
                  className="text-sm text-gray-300 font-mono truncate min-w-0"
                  title={
                    inherited.length > 0
                      ? `From the repository root: ${inherited.map((r) => name(r.criterionId)).join(", ")}`
                      : undefined
                  }
                >
                  {s.path}
                </span>
                <span className="text-sm font-medium text-gray-400 shrink-0">
                  {s.percentage}% ({s.passed}/{s.total})
                </span>
              </div>
              <div className="h-2 bg-surface-elevated rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${barColor(s.percentage)}`}
                  style={{ width: `${s.percentage}%` }}
                />
              </div>
              {missing.length > 0 && (
                <p className="text-xs text-gray-500 mt-1">
                  Missing: {missing.map((r) => name(r.criterionId)).join(", ")}
                </p>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
