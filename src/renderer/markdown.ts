import type { SerializedReportData } from "../engine/serializer.js";
import { LEVEL_LABELS, type MaturityLevel } from "../types/index.js";

/** Details longer than this go in a collapsed <details> block, as in the dashboard. */
const COLLAPSE_AT = 280;

function indent(text: string): string {
  return text
    .split("\n")
    .map((l) => `  ${l}`)
    .join("\n");
}

/** The report as Markdown, from the same data as the JSON output and the dashboard. */
export function renderMarkdown(r: SerializedReportData): string {
  const passed = r.pillarScores.reduce((n, s) => n + s.passed, 0);
  const total = r.pillarScores.reduce((n, s) => n + s.total, 0);
  const overall = total === 0 ? 0 : Math.round((passed / total) * 100);
  const { level, nextLevelProgress: next } = r.levelResult;
  const out: string[] = [];

  out.push(`# Agent readiness: ${r.repoName}`, "");
  out.push(`**Level ${level}: ${LEVEL_LABELS[level]}**. Overall score: ${overall}% (${passed}/${total} checks).`);
  if (next.nextLevel) {
    out.push(`${next.remaining} more criteria to reach Level ${next.nextLevel} (${LEVEL_LABELS[next.nextLevel as MaturityLevel]}).`);
  }
  const types = r.projectInfo.detectedTypes.join(", ") || "unknown";
  out.push("", `Project: ${types}${r.projectInfo.isMonorepo ? " (monorepo)" : ""}. Path: \`${r.repoPath}\`.`, "");

  out.push("## Pillars", "", "| Pillar | Score | Pass/Total |", "|---|---|---|");
  for (const p of r.pillars) {
    const s = r.pillarScores.find((x) => x.pillarId === p.id);
    if (s) out.push(`| ${p.icon} ${p.name} | ${s.percentage}% | ${s.passed}/${s.total} |`);
  }
  out.push("");

  out.push("## Checks", "");
  for (const p of r.pillars) {
    out.push(`### ${p.icon} ${p.name}`, "");
    for (const c of p.criteria) {
      const res = r.results[p.id]?.find((x) => x.criterionId === c.id);
      if (!res) continue;
      if (res.skipped) {
        out.push(`- ⏭️ **${c.name}** (level ${c.level}): ${res.message || "skipped, requires --ai"}`);
        continue;
      }
      out.push(`- ${res.pass ? "✅" : "❌"} **${c.name}** (level ${c.level}): ${res.message}`);
      if (!res.pass && res.details) {
        out.push(
          res.details.length > COLLAPSE_AT
            ? `  <details><summary>Details</summary>\n\n${indent(res.details.trimEnd())}\n\n  </details>`
            : indent(res.details.trimEnd()),
        );
      }
    }
    out.push("");
  }

  // Same order as the terminal report: lowest level first.
  const recs = r.recommendations.slice(0, 10);
  if (recs.length > 0) {
    out.push("## Top recommendations", "");
    for (const [i, rec] of recs.entries()) {
      const pillar = r.pillars.find((p) => p.id === rec.pillarId)?.name ?? rec.pillarId;
      out.push(`${i + 1}. **${rec.title}** (impact ${rec.impact}, ${pillar}): ${rec.description}. ${rec.reason}`);
    }
    out.push("");
  }
  return out.join("\n");
}
