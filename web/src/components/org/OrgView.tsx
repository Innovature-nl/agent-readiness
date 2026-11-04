import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { CriterionInfo, OrgSummary } from "../../types";
import { LEVEL_LABELS } from "../../types";
import RepoView from "./RepoView";
import {
  Card,
  CriteriaBar,
  Delta,
  FixItem,
  Hint,
  LEVEL_INFO,
  LEVELS,
  LevelBadge,
  Legend,
  TOOLTIP_STYLE,
  nextLevelPlan,
  rateClass,
  repoResult,
  selectRepos,
} from "./shared";
import RepoPicker, { useExcludedRepos } from "./RepoPicker";

interface Props {
  data: OrgSummary;
}

export default function OrgView({ data }: Props) {
  const [excluded, setExcluded] = useExcludedRepos();
  const view = useMemo(() => selectRepos(data, (name) => !excluded.has(name)), [data, excluded]);
  return (
    <OrgOverview
      data={view}
      picker={<RepoPicker names={data.repos.map((r) => r.repoName).sort()} excluded={excluded} onChange={setExcluded} />}
    />
  );
}

const REPO_PATH = /^\/repo\/([^/]+)\/?$/;

function repoFromLocation(): string | null {
  const match = REPO_PATH.exec(window.location.pathname);
  return match ? decodeURIComponent(match[1]) : null;
}

/** The open repository lives in the URL (/repo/<name>), so a refresh or the back button keeps it. */
function useRepoRoute(): [string | null, (name: string | null) => void] {
  const [repo, setRepo] = useState(repoFromLocation);
  useEffect(() => {
    const onPop = () => setRepo(repoFromLocation());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  const navigate = (name: string | null) => {
    window.history.pushState(null, "", name ? `/repo/${encodeURIComponent(name)}` : "/");
    setRepo(name);
    window.scrollTo(0, 0);
  };
  return [repo, navigate];
}

function OrgOverview({ data, picker }: Props & { picker: ReactNode }) {
  const [selectedRepo, setSelectedRepo] = useRepoRoute();
  const [selectedCriterion, setSelectedCriterion] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const { repos, criteria, pillars, trend } = data;

  const stats = useMemo(() => {
    const byCriterion = new Map<string, { pass: number; fail: number }>();
    for (const c of criteria) {
      let pass = 0;
      let fail = 0;
      for (const r of repos) {
        const res = repoResult(r, c.id);
        if (res === true) pass++;
        if (res === false) fail++;
      }
      byCriterion.set(c.id, { pass, fail });
    }
    return byCriterion;
  }, [criteria, repos]);

  const rate = (c: CriterionInfo) => {
    const s = stats.get(c.id)!;
    return s.pass + s.fail === 0 ? null : s.pass / (s.pass + s.fail);
  };

  const totals = [...stats.values()].reduce((t, s) => ({ pass: t.pass + s.pass, all: t.all + s.pass + s.fail }), { pass: 0, all: 0 });
  const overall = totals.all ? Math.round((totals.pass / totals.all) * 100) : 0;
  const level3Plus = repos.length ? Math.round((repos.filter((r) => r.level >= 3).length / repos.length) * 100) : 0;

  const pillarRadar = pillars.map((p) => {
    let pass = 0;
    let all = 0;
    for (const c of criteria.filter((c) => c.pillarId === p.id)) {
      const s = stats.get(c.id)!;
      pass += s.pass;
      all += s.pass + s.fail;
    }
    return { pillar: p.name, score: all ? Math.round((pass / all) * 100) : 0 };
  });

  // A criterion "blocks" a repo when it fails and is needed for that repo's next level.
  const biggestWins = useMemo(() => {
    const blocked = new Map<string, string[]>();
    for (const r of repos) {
      for (const step of nextLevelPlan(r, criteria)) {
        for (const c of step.failing) blocked.set(c.id, [...(blocked.get(c.id) ?? []), r.repoName]);
      }
    }
    return criteria
      .filter((c) => blocked.has(c.id))
      .map((c) => ({ c, repos: blocked.get(c.id)! }))
      .sort((a, b) => a.c.level - b.c.level || b.repos.length - a.repos.length)
      .slice(0, 6);
  }, [repos, criteria]);

  const repo = repos.find((r) => r.repoName === selectedRepo);
  if (repo) {
    return <RepoView data={data} repo={repo} onBack={() => setSelectedRepo(null)} />;
  }

  const selected = criteria.find((c) => c.id === selectedCriterion);
  const filteredRepos = repos.filter((r) => r.repoName.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      {picker}
      <Card
        title="Organization readiness"
        right={<span className="text-xs text-gray-500">{repos.length} repositories</span>}
      >
        <div className="flex flex-wrap items-baseline gap-x-6 gap-y-2 mb-4">
          <span className="text-3xl font-bold text-white">
            Level {data.orgLevel} <span className="text-base font-medium text-gray-400">{LEVEL_LABELS[data.orgLevel as 1] ?? ""}</span>
          </span>
          <span className="text-sm text-gray-300">{overall}% of all checks pass</span>
          <span className="text-sm text-gray-300">{level3Plus}% of repositories at level 3 or higher</span>
        </div>
        <Hint>
          Each block is one check, ordered by level. The colour shows in how many repositories it passes. Hover a block to see which check it is and how to fix it.
          The organization level is the average repository level, rounded down.
        </Hint>
        <CriteriaBar
          criteria={criteria}
          rate={rate}
          rateLabel={(r, c) => {
            const s = stats.get(c.id)!;
            const na = repos.length - s.pass - s.fail;
            return `Passes in ${s.pass} of ${s.pass + s.fail} repositories (${Math.round(r * 100)}%)${na ? `, N/A in ${na}` : ""}`;
          }}
        />
        <Legend />
      </Card>

      <details className="bg-surface-card border border-surface-border rounded-xl p-6 group">
        <summary className="text-sm font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">
          How the levels work
        </summary>
        <p className="text-sm text-gray-300 mt-4">
          The score measures how well an AI coding agent can work in a repository on its own: find its way, check its own work and
          ship safely. A repository reaches a level once 80% of that level's checks pass <em>and</em> every level below it is reached.
          So one missing basic at level 1 keeps a repository at level 1, however good the rest is.
        </p>
        <ul className="mt-4 space-y-2">
          {LEVELS.map((l) => (
            <li key={l} className="flex gap-3 text-sm">
              <span className="shrink-0"><LevelBadge level={l} /></span>
              <span className="text-gray-300">{LEVEL_INFO[l]}</span>
            </li>
          ))}
        </ul>
      </details>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Pass rate by category">
          <Hint>Share of checks per category that pass, over all repositories. A dent shows where the organization is weakest.</Hint>
          <ResponsiveContainer width="100%" height={280}>
            <RadarChart data={pillarRadar} outerRadius="70%">
              <PolarGrid stroke="#2a2a3a" />
              <PolarAngleAxis dataKey="pillar" tick={{ fill: "#9ca3af", fontSize: 11 }} />
              <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: "#6b7280", fontSize: 10 }} tickCount={5} />
              <Tooltip contentStyle={TOOLTIP_STYLE} formatter={(v: number) => [`${v}%`, "Pass rate"]} />
              <Radar dataKey="score" stroke="#f59e0b" fill="#f59e0b" fillOpacity={0.2} strokeWidth={2} />
            </RadarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Level over time">
          <Hint>The organization level on each day a scan ran. It rises when enough repositories move up.</Hint>
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={trend}>
                <CartesianGrid stroke="#2a2a3a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="stepAfter" dataKey="orgLevel" name="Org level" stroke="#f59e0b" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500">The trend appears after scans on more than one day.</p>
          )}
        </Card>
      </div>

      <Card title="Biggest wins">
        <Hint>
          The checks that hold back the most repositories from their next level, lowest level first. Fixing one of these moves
          several repositories at once.
        </Hint>
        {biggestWins.length === 0 ? (
          <p className="text-sm text-gray-300">Nothing blocks a repository from its next level.</p>
        ) : (
          <ul>
            {biggestWins.map(({ c, repos: blocked }) => (
              <FixItem
                key={c.id}
                c={c}
                extra={
                  <span className="text-xs text-fail" title={blocked.join(", ")}>
                    blocks {blocked.length} of {repos.length} repositories
                  </span>
                }
              />
            ))}
          </ul>
        )}
      </Card>

      <Card title="Checks by category">
        <Hint>Click a check to see what it means, how to fix it and which repositories fail it. The number is passing / evaluated repositories.</Hint>
        <div className="space-y-6">
          {pillars.map((p) => {
            const pc = criteria.filter((c) => c.pillarId === p.id);
            return (
              <div key={p.id}>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-sm font-semibold text-gray-300">{p.name}</h3>
                  <span className="text-xs text-gray-500">{pillarRadar.find((r) => r.pillar === p.name)?.score}%</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
                  {pc.map((c) => {
                    const s = stats.get(c.id)!;
                    const r = rate(c);
                    return (
                      <button
                        type="button"
                        key={c.id}
                        onClick={() => setSelectedCriterion(c.id === selectedCriterion ? null : c.id)}
                        className={`text-left rounded-md p-2 min-h-20 flex flex-col justify-between border transition-colors ${
                          c.id === selectedCriterion ? "border-white" : "border-transparent"
                        } ${rateClass(r)} ${r === null ? "text-gray-400" : "text-white"} bg-opacity-80 hover:bg-opacity-100`}
                      >
                        <span className="text-[10px] uppercase tracking-wider opacity-80">Level {c.level}</span>
                        <span className="text-xs font-medium leading-tight">{c.name}</span>
                        <span className="text-[11px] self-end opacity-90">{r === null ? "N/A" : `${s.pass}/${s.pass + s.fail}`}</span>
                      </button>
                    );
                  })}
                </div>
                {selected && selected.pillarId === p.id && (
                  <div className="mt-3 p-4 rounded-lg bg-surface-elevated border border-surface-border">
                    <ul>
                      <FixItem c={selected} />
                    </ul>
                    {selected.requiresLLM && <p className="text-xs text-gray-500 mt-2">This check only runs with --ai.</p>}
                    <p className="text-xs text-gray-400 mt-2">Fails in:</p>
                    <div className="flex flex-wrap gap-2 mt-1">
                      {repos.filter((r) => repoResult(r, selected.id) === false).map((r) => (
                        <button
                          type="button"
                          key={r.repoName}
                          onClick={() => setSelectedRepo(r.repoName)}
                          className="text-xs px-2 py-1 rounded bg-surface-card border border-surface-border text-gray-300 hover:text-white"
                        >
                          {r.repoName}
                        </button>
                      ))}
                      {repos.every((r) => repoResult(r, selected.id) !== false) && <span className="text-xs text-gray-500">none</span>}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      <Card
        title={`Repositories (${repos.length})`}
        right={
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search"
            aria-label="Search repositories"
            className="bg-surface-elevated border border-surface-border rounded-md px-3 py-1 text-sm text-gray-200 w-48"
          />
        }
      >
        <Hint>Lowest level first. Click a repository for its own report and a step-by-step plan to reach the next level.</Hint>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-surface-border">
                <th className="py-2 pr-4 font-medium">Level</th>
                <th className="py-2 pr-4 font-medium">Repository</th>
                <th className="py-2 pr-4 font-medium">Checks passing</th>
                <th className="py-2 pr-4 font-medium">Change</th>
                <th className="py-2 font-medium">Last scan</th>
              </tr>
            </thead>
            <tbody>
              {filteredRepos.map((r) => (
                <tr
                  key={r.repoName}
                  onClick={() => setSelectedRepo(r.repoName)}
                  className="border-b border-surface-border/50 text-gray-300 cursor-pointer hover:bg-surface-elevated"
                >
                  <td className="py-2 pr-4"><LevelBadge level={r.level} /></td>
                  <td className="py-2 pr-4">
                    <button type="button" className="text-white hover:text-accent-light">{r.repoName} &rsaquo;</button>
                  </td>
                  <td className="py-2 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="w-24 h-2 bg-surface-elevated rounded-full overflow-hidden">
                        <div className={`h-full ${rateClass(r.percentage / 100)}`} style={{ width: `${r.percentage}%` }} />
                      </div>
                      {r.percentage}%
                    </div>
                  </td>
                  <td className="py-2 pr-4">
                    {r.levelDelta === null ? (
                      <span className="text-gray-500">new</span>
                    ) : (
                      <>
                        <Delta value={r.levelDelta} /> lvl, <Delta value={r.percentageDelta} suffix="%" />
                      </>
                    )}
                  </td>
                  <td className="py-2">{r.timestamp.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
