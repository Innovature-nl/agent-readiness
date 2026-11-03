import chalk from "chalk";
import Table from "cli-table3";
import type { MaturityLevel } from "../types/index.js";
import { LEVEL_LABELS } from "../types/index.js";
import type { OrgSummary, SnapshotDiff } from "../engine/history.js";

function signed(n: number, suffix = ""): string {
  if (n > 0) return chalk.green(`+${n}${suffix}`);
  if (n < 0) return chalk.red(`${n}${suffix}`);
  return chalk.dim(`0${suffix}`);
}

export function renderHistoryDiff(diff: SnapshotDiff | undefined, previousTimestamp?: string): void {
  console.log("");
  if (!diff) {
    console.log(chalk.dim("  History: first snapshot for this repository."));
    console.log("");
    return;
  }
  console.log(`  ${chalk.bold("Since")} ${previousTimestamp}: level ${signed(diff.levelDelta)}, score ${signed(diff.percentageDelta, "%")}`);
  for (const id of diff.newlyPassing) console.log(`    ${chalk.green("now passing")}  ${id}`);
  for (const id of diff.newlyFailing) console.log(`    ${chalk.red("now failing")}  ${id}`);
  console.log("");
}

export function renderOrgSummary(summary: OrgSummary): void {
  if (summary.repos.length === 0) {
    console.log("No snapshots found. Run the evaluation with --history <dir> first.");
    return;
  }
  const label = LEVEL_LABELS[summary.orgLevel as MaturityLevel] ?? "-";
  console.log("");
  console.log(`  ${chalk.bold("Organization level:")} ${summary.orgLevel} - ${label} (${summary.repos.length} repositories)`);
  console.log("");

  const repos = new Table({ head: ["Repository", "Level", "Score", "Change", "Last scan"] });
  for (const r of summary.repos) {
    const change =
      r.levelDelta === null || r.percentageDelta === null
        ? chalk.dim("new")
        : `${signed(r.levelDelta)} lvl, ${signed(r.percentageDelta, "%")}`;
    repos.push([r.repoName, `${r.level} ${LEVEL_LABELS[r.level]}`, `${r.percentage}%`, change, r.timestamp.slice(0, 10)]);
  }
  console.log(repos.toString());

  if (summary.trend.length > 1) {
    const trend = new Table({ head: ["Date", "Org level", "Repositories"] });
    for (const t of summary.trend) trend.push([t.date, String(t.orgLevel), String(t.repoCount)]);
    console.log("");
    console.log(trend.toString());
  }
  console.log("");
}
