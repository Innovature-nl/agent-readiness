import { describe, test, expect, afterEach } from "bun:test";
import type { MaturityLevel } from "../../src/types/index.js";
import {
  type Snapshot,
  saveSnapshot,
  loadHistory,
  diffSnapshots,
  summarizeOrg,
} from "../../src/engine/history.js";
import { createTestDir, cleanup } from "../helpers.js";

let dirs: string[] = [];

afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

function snap(repoName: string, timestamp: string, level: MaturityLevel, passed: string[], failed: string[]): Snapshot {
  const total = passed.length + failed.length;
  return {
    repoName,
    timestamp,
    level,
    percentage: total ? Math.round((passed.length / total) * 100) : 0,
    pillarScores: [],
    passed,
    failed,
  };
}

describe("history", () => {
  test("saveSnapshot returns the previous snapshot and loadHistory sorts by time", async () => {
    const dir = await createTestDir("history");
    dirs.push(dir);

    expect(await saveSnapshot(dir, snap("api", "2026-11-01T10:00:00.000Z", 2, ["a"], ["b"]))).toBeUndefined();
    const previous = await saveSnapshot(dir, snap("api", "2026-11-02T10:00:00.000Z", 3, ["a", "b"], []));
    expect(previous?.level).toBe(2);

    const history = await loadHistory(dir);
    expect(history.get("api")?.map((s) => s.level)).toEqual([2, 3]);
  });

  test("loadHistory on a missing directory is empty", async () => {
    expect((await loadHistory("/nonexistent/agent-readiness-history")).size).toBe(0);
  });

  test("diffSnapshots reports level, score and criteria changes", () => {
    const diff = diffSnapshots(
      snap("api", "2026-11-01T10:00:00.000Z", 2, ["a", "c"], ["b"]),
      snap("api", "2026-11-02T10:00:00.000Z", 3, ["a", "b"], ["c"]),
    );
    expect(diff).toEqual({ levelDelta: 1, percentageDelta: 0, newlyPassing: ["b"], newlyFailing: ["c"] });
  });

  test("summarizeOrg floors the average level and builds a daily trend", () => {
    const history = new Map<string, Snapshot[]>([
      ["api", [snap("api", "2026-11-01T10:00:00.000Z", 2, [], []), snap("api", "2026-11-02T10:00:00.000Z", 4, [], [])]],
      ["web", [snap("web", "2026-11-01T11:00:00.000Z", 1, [], [])]],
    ]);
    const summary = summarizeOrg(history);

    // (4 + 1) / 2 = 2.5, rounded down
    expect(summary.orgLevel).toBe(2);
    expect(summary.repos.map((r) => [r.repoName, r.levelDelta])).toEqual([["web", null], ["api", 2]]);
    expect(summary.trend).toEqual([
      { date: "2026-11-01", orgLevel: 1, repoCount: 2 },
      { date: "2026-11-02", orgLevel: 2, repoCount: 2 },
    ]);
  });
});
