import fs from "node:fs/promises";
import path from "node:path";
import type { MaturityLevel, Pillar, PillarScore, ReportData } from "../types/index.js";
import { overallPercentage } from "../renderer/index.js";
import { CRITERION_INFO, EFFORT_MAP } from "./recommender.js";

export interface Snapshot {
  repoName: string;
  timestamp: string;
  level: MaturityLevel;
  percentage: number;
  pillarScores: PillarScore[];
  passed: string[];
  failed: string[];
  /** Why each skipped criterion did not run (needs --ai, not applicable). Missing in older snapshots. */
  skipped?: Record<string, string>;
}

export interface SnapshotDiff {
  levelDelta: number;
  percentageDelta: number;
  newlyPassing: string[];
  newlyFailing: string[];
}

export interface OrgRepoSummary {
  repoName: string;
  level: MaturityLevel;
  percentage: number;
  timestamp: string;
  levelDelta: number | null;
  percentageDelta: number | null;
  passed: string[];
  failed: string[];
  skipped: Record<string, string>;
  /** Level at the end of each day with a scan, oldest first; lets the dashboard rebuild the trend for any repo selection. */
  history: Array<{ date: string; level: MaturityLevel }>;
}

/** Static description of a criterion, so the dashboard can explain it and say how to fix it. */
export interface CriterionInfo {
  id: string;
  name: string;
  pillarId: string;
  level: MaturityLevel;
  requiresLLM: boolean;
  fix: string;
  why: string;
  effort: string;
}

export interface OrgSummary {
  orgLevel: number;
  pillars: Array<{ id: string; name: string }>;
  criteria: CriterionInfo[];
  repos: OrgRepoSummary[];
  trend: Array<{ date: string; orgLevel: number; repoCount: number }>;
  /** Set when the dashboard can list and scan a GitHub organization. */
  github?: { org: string; ai: boolean };
}

export function toSnapshot(report: ReportData, timestamp: Date = new Date()): Snapshot {
  const passed: string[] = [];
  const failed: string[] = [];
  const skipped: Record<string, string> = {};
  for (const results of report.results.values()) {
    for (const r of results) {
      if (r.skipped) {
        skipped[r.criterionId] = r.message;
        continue;
      }
      (r.pass ? passed : failed).push(r.criterionId);
    }
  }
  return {
    repoName: report.repoName,
    timestamp: timestamp.toISOString(),
    level: report.levelResult.level,
    percentage: overallPercentage(report.pillarScores),
    pillarScores: report.pillarScores,
    passed: passed.sort(),
    failed: failed.sort(),
    skipped,
  };
}

/** Reads all snapshots under `<dir>/<repo>/*.json`, oldest first per repo. */
export async function loadHistory(dir: string): Promise<Map<string, Snapshot[]>> {
  const history = new Map<string, Snapshot[]>();
  let repoDirs: string[];
  try {
    repoDirs = await fs.readdir(dir);
  } catch {
    return history;
  }
  for (const repo of repoDirs) {
    const repoDir = path.join(dir, repo);
    if (!(await fs.stat(repoDir)).isDirectory()) continue;
    const files = (await fs.readdir(repoDir)).filter((f) => f.endsWith(".json"));
    const snapshots: Snapshot[] = [];
    for (const file of files) {
      snapshots.push(JSON.parse(await fs.readFile(path.join(repoDir, file), "utf-8")));
    }
    if (snapshots.length === 0) continue;
    snapshots.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    history.set(snapshots[0].repoName, snapshots);
  }
  return history;
}

/** Writes the snapshot and returns the most recent earlier snapshot of the same repo, if any. */
export async function saveSnapshot(dir: string, snapshot: Snapshot): Promise<Snapshot | undefined> {
  const repoDir = path.join(dir, snapshot.repoName);
  const previous = (await loadHistory(dir)).get(snapshot.repoName)?.at(-1);
  await fs.mkdir(repoDir, { recursive: true });
  // Colons are not allowed in Windows file names.
  const file = `${snapshot.timestamp.replace(/:/g, "-")}.json`;
  await fs.writeFile(path.join(repoDir, file), `${JSON.stringify(snapshot, null, 2)}\n`, "utf-8");
  return previous;
}

export function diffSnapshots(previous: Snapshot, current: Snapshot): SnapshotDiff {
  const wasPassing = new Set(previous.passed);
  const wasFailing = new Set(previous.failed);
  return {
    levelDelta: current.level - previous.level,
    percentageDelta: current.percentage - previous.percentage,
    newlyPassing: current.passed.filter((id) => !wasPassing.has(id)),
    newlyFailing: current.failed.filter((id) => !wasFailing.has(id)),
  };
}

/** Same rule as Factory: the average of the repo levels, rounded down. */
function orgLevel(levels: number[]): number {
  if (levels.length === 0) return 0;
  return Math.floor(levels.reduce((sum, l) => sum + l, 0) / levels.length);
}

export function summarizeOrg(history: Map<string, Snapshot[]>, pillars: Pillar[] = []): OrgSummary {
  const repos: OrgRepoSummary[] = [];
  for (const [repoName, snapshots] of history) {
    const latest = snapshots.at(-1)!;
    const previous = snapshots.at(-2);
    repos.push({
      repoName,
      level: latest.level,
      percentage: latest.percentage,
      timestamp: latest.timestamp,
      levelDelta: previous ? latest.level - previous.level : null,
      percentageDelta: previous ? latest.percentage - previous.percentage : null,
      passed: latest.passed,
      failed: latest.failed,
      skipped: latest.skipped ?? {},
      history: [...new Map(snapshots.map((s) => [s.timestamp.slice(0, 10), s.level])).entries()].map(([date, level]) => ({ date, level })),
    });
  }
  repos.sort((a, b) => a.level - b.level || a.percentage - b.percentage || a.repoName.localeCompare(b.repoName));

  // For each day with at least one scan, every repo counts with its latest snapshot up to that day.
  const dates = [...new Set([...history.values()].flat().map((s) => s.timestamp.slice(0, 10)))].sort();
  const trend = dates.map((date) => {
    const levels: number[] = [];
    for (const snapshots of history.values()) {
      const latest = snapshots.filter((s) => s.timestamp.slice(0, 10) <= date).at(-1);
      if (latest) levels.push(latest.level);
    }
    return { date, orgLevel: orgLevel(levels), repoCount: levels.length };
  });

  const criteria = pillars.flatMap((p) =>
    p.criteria.map((c) => ({
      id: c.id,
      name: c.name,
      pillarId: p.id,
      level: c.level,
      requiresLLM: c.requiresLLM,
      fix: [CRITERION_INFO[c.id]?.description ?? c.description, c.profileNote].filter(Boolean).join(" "),
      why: CRITERION_INFO[c.id]?.reason ?? "",
      effort: EFFORT_MAP[c.id] ?? "medium",
    })),
  );

  return {
    orgLevel: orgLevel(repos.map((r) => r.level)),
    pillars: pillars.map((p) => ({ id: p.id, name: p.name })),
    criteria,
    repos,
    trend,
  };
}
