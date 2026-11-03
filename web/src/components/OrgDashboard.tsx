import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { MaturityLevel, OrgSummary } from "../types";
import { LEVEL_LABELS } from "../types";

interface Props {
  data: OrgSummary;
}

const LEVELS: MaturityLevel[] = [1, 2, 3, 4, 5];

const TOOLTIP_STYLE = {
  backgroundColor: "#1a1a25",
  border: "1px solid #2a2a3a",
  borderRadius: "8px",
  color: "#e5e7eb",
  fontSize: "12px",
};

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface-card border border-surface-border rounded-xl p-6">
      <h2 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-4">{title}</h2>
      {children}
    </div>
  );
}

function Delta({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) return <span className="text-gray-500">new</span>;
  if (value > 0) return <span className="text-pass">+{value}{suffix}</span>;
  if (value < 0) return <span className="text-fail">{value}{suffix}</span>;
  return <span className="text-gray-500">0{suffix}</span>;
}

export default function OrgDashboard({ data }: Props) {
  const { repos, trend } = data;
  const level3Plus = repos.length ? Math.round((repos.filter((r) => r.level >= 3).length / repos.length) * 100) : 0;
  const distribution = LEVELS.map((level) => ({
    level: `L${level}`,
    repositories: repos.filter((r) => r.level === level).length,
  }));

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">
      <h1 className="text-2xl font-bold text-white">Organization readiness</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
        <Card title="Organization level">
          <p className="text-3xl font-bold text-white">
            L{data.orgLevel}{" "}
            <span className="text-base font-medium text-gray-400">
              {LEVEL_LABELS[data.orgLevel as MaturityLevel] ?? ""}
            </span>
          </p>
        </Card>
        <Card title="Repositories">
          <p className="text-3xl font-bold text-white">{repos.length}</p>
        </Card>
        <Card title="Level 3 or higher">
          <p className="text-3xl font-bold text-white">{level3Plus}%</p>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card title="Repositories per level">
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={distribution}>
              <CartesianGrid stroke="#2a2a3a" vertical={false} />
              <XAxis dataKey="level" tick={{ fill: "#9ca3af", fontSize: 12 }} />
              <YAxis allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 11 }} />
              <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: "#1a1a25" }} />
              <Bar dataKey="repositories" fill="#f59e0b" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Card>
        <Card title="Organization level over time">
          {trend.length > 1 ? (
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={trend}>
                <CartesianGrid stroke="#2a2a3a" vertical={false} />
                <XAxis dataKey="date" tick={{ fill: "#9ca3af", fontSize: 11 }} />
                <YAxis domain={[0, 5]} allowDecimals={false} tick={{ fill: "#6b7280", fontSize: 11 }} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Line type="stepAfter" dataKey="orgLevel" name="Org level" stroke="#f59e0b" strokeWidth={2} dot />
              </LineChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-sm text-gray-500">The trend appears after scans on more than one day.</p>
          )}
        </Card>
      </div>

      <Card title="Repositories, lowest first">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-400 border-b border-surface-border">
                <th className="py-2 pr-4 font-medium">Repository</th>
                <th className="py-2 pr-4 font-medium">Level</th>
                <th className="py-2 pr-4 font-medium">Score</th>
                <th className="py-2 pr-4 font-medium">Change</th>
                <th className="py-2 font-medium">Last scan</th>
              </tr>
            </thead>
            <tbody>
              {repos.map((r) => (
                <tr key={r.repoName} className="border-b border-surface-border/50 text-gray-300">
                  <td className="py-2 pr-4 text-white">{r.repoName}</td>
                  <td className="py-2 pr-4">L{r.level} {LEVEL_LABELS[r.level]}</td>
                  <td className="py-2 pr-4">{r.percentage}%</td>
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
