import { describe, test, expect } from "bun:test";
import { renderMarkdown } from "../../src/renderer/markdown.js";
import type { SerializedReportData } from "../../src/engine/serializer.js";

const report: SerializedReportData = {
  repoName: "btcdirect",
  repoPath: "/repos/btcdirect",
  projectInfo: { detectedTypes: ["go", "node"], isMonorepo: true, packages: [] },
  pillars: [
    {
      id: "style-linting",
      name: "Style & Linting",
      description: "",
      icon: "🎨",
      criteria: [
        { id: "linter", name: "Linter configured", description: "", pillarId: "style-linting", level: 2, requiresLLM: false },
        { id: "naming-conventions", name: "Naming conventions (AI)", description: "", pillarId: "style-linting", level: 5, requiresLLM: true },
      ],
    },
    {
      id: "documentation",
      name: "Documentation",
      description: "",
      icon: "📚",
      criteria: [{ id: "enforced-agent-rules", name: "Agent rules are enforced (AI)", description: "", pillarId: "documentation", level: 5, requiresLLM: true }],
    },
  ],
  results: {
    "style-linting": [
      { criterionId: "linter", pass: true, message: "Linter configuration found: .golangci.yml" },
      { criterionId: "naming-conventions", pass: false, message: "", skipped: true },
    ],
    documentation: [
      { criterionId: "enforced-agent-rules", pass: false, message: "0 of 6 parts pass.", details: `Part 1:\n${"- Never do x.\n".repeat(40)}` },
    ],
  },
  levelResult: { level: 3, nextLevelProgress: { current: 9, needed: 10, remaining: 1, nextLevel: 4 } },
  pillarScores: [
    { pillarId: "style-linting", passed: 1, total: 1, percentage: 100 },
    { pillarId: "documentation", passed: 0, total: 1, percentage: 0 },
  ],
  recommendations: [
    { title: "Agent rules are enforced (AI)", description: "Back every hard rule with a check", reason: "Nothing fails when an agent skips a sentence", effort: "medium", impact: "medium", pillarId: "documentation", criterionId: "enforced-agent-rules" },
  ],
};

describe("renderMarkdown", () => {
  const md = renderMarkdown(report);

  test("opens with the repository, level and score", () => {
    expect(md).toStartWith("# Agent readiness: btcdirect");
    expect(md).toContain("**Level 3: Structured**");
    expect(md).toContain("1 more criteria to reach Level 4");
    expect(md).toContain("Overall score: 50%");
  });

  test("has a pillar table", () => {
    expect(md).toContain("| Pillar | Score | Pass/Total |");
    expect(md).toContain("| 🎨 Style & Linting | 100% | 1/1 |");
  });

  test("lists every check with pass, fail or skipped", () => {
    expect(md).toContain("- ✅ **Linter configured** (level 2): Linter configuration found: .golangci.yml");
    expect(md).toContain("- ⏭️ **Naming conventions (AI)** (level 5): skipped, requires --ai");
    expect(md).toContain("- ❌ **Agent rules are enforced (AI)** (level 5): 0 of 6 parts pass.");
  });

  test("puts long details in a collapsed block with their line breaks", () => {
    expect(md).toContain("<details><summary>Details</summary>");
    expect(md).toContain("  - Never do x.\n  - Never do x.");
  });

  test("ends with the recommendations", () => {
    expect(md).toContain("## Top recommendations");
    expect(md).toContain("1. **Agent rules are enforced (AI)** (impact medium, Documentation): Back every hard rule with a check. Nothing fails when an agent skips a sentence");
  });
});
