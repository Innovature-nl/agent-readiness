import { readFile } from "node:fs/promises";
import { join } from "node:path";
import fg from "fast-glob";
import type { Criterion } from "../types/index.js";

// Checks that ask whether the codebase itself stops an agent from repeating a mistake,
// instead of asking it in prose. After Lauren Tan, "All Code Is Slop (Except Mine)",
// AI Engineer Code Summit 2026.

const IGNORE = ["**/node_modules/**", "**/vendor/**", "**/.git/**", "**/dist/**", "**/build/**", "**/target/**", "**/gen/**", "**/generated/**"];

const SOURCE = "**/*.{ts,tsx,js,jsx,mjs,cjs,go,py,php,rb,kt,kts,java,cs,rs,swift}";

// shortcut: a sample, not every file; enough for a density on large monorepos.
const MAX_FILES = 5000;

const SUPPRESSION =
  /eslint-disable|biome-ignore|oxlint-disable|@ts-ignore|@ts-nocheck|\/\/\s*nolint|#\s*noqa|#\s*type:\s*ignore|pylint:\s*disable|@phpstan-ignore|@psalm-suppress|phpcs:ignore|@Suppress\(|@SuppressWarnings|#\[allow\(|rubocop:disable|swiftlint:disable|#pragma warning disable/;

/** Inline lint suppressions without a reason per 1,000 lines above this fail the check. */
export const SUPPRESSION_LIMIT = 1;

const RULE_IDS = /^[\w:/,.@()-]*/;

/**
 * A suppression has a reason when the marker and its rule ids are followed by at least two
 * words, after a separator such as `--`, `//`, `#` or `:` (Biome requires one after the colon).
 */
export function hasReason(line: string): boolean {
  const m = line.match(SUPPRESSION);
  if (!m || m.index === undefined) return false;
  let rest = line.slice(m.index + m[0].length).trimStart();
  rest = rest.replace(RULE_IDS, "").trim();
  rest = rest.replace(/^(--|\/\/|#|:|-)\s*/, "").replace(/\*\/\s*$/, "").trim();
  return rest.split(/\s+/).filter((w) => /\w/.test(w)).length >= 2;
}

async function readAll(repoPath: string, files: string[]): Promise<string[]> {
  return Promise.all(files.map((f) => readFile(join(repoPath, f), "utf-8").catch(() => "")));
}

const lintSuppressions: Criterion = {
  id: "lint-suppressions",
  name: "Few lint suppressions",
  description: `At most ${SUPPRESSION_LIMIT} inline lint suppression without a reason (eslint-disable, //nolint, # noqa, @ts-ignore and the like) per 1,000 lines of code.`,
  pillarId: "style-linting",
  level: 3,
  requiresLLM: false,
  check: async (repoPath) => {
    const files = (await fg(SOURCE, { cwd: repoPath, ignore: IGNORE, dot: false })).slice(0, MAX_FILES);
    let lines = 0;
    let suppressed = 0;
    let unexplained = 0;
    for (const text of await readAll(repoPath, files)) {
      for (const line of text.split("\n")) {
        lines++;
        if (!SUPPRESSION.test(line)) continue;
        suppressed++;
        if (!hasReason(line)) unexplained++;
      }
    }
    if (lines === 0) {
      return { criterionId: "lint-suppressions", pass: true, message: "No source files to check." };
    }
    const perK = (unexplained / lines) * 1000;
    const message = `${unexplained} of ${suppressed} inline suppressions without a reason in ${lines.toLocaleString("en-US")} lines (${perK.toFixed(2)} per 1,000).`;
    if (perK <= SUPPRESSION_LIMIT) {
      return { criterionId: "lint-suppressions", pass: true, message };
    }
    return {
      criterionId: "lint-suppressions",
      pass: false,
      message,
      details:
        "Every suppression is an escape hatch an agent copies as the local pattern. Fix the root cause; where an exception stays, give it a reason on the same line and enforce that (golangci nolintlint require-explanation, eslint-comments/require-description).",
    };
  },
};

// Linter settings that only exist to encode a project's own lessons.
const CUSTOM_RULE_FILES = [
  "**/.golangci.{yml,yaml,toml,json}",
  "**/{eslint.config.*,.eslintrc,.eslintrc.*}",
  "**/biome.{json,jsonc}",
  "**/{pyproject.toml,ruff.toml,.ruff.toml}",
  "**/phpstan.neon{,.dist}",
  "**/{detekt.yml,.detekt.yml,detekt-config.yml}",
  "**/.rubocop.yml",
];
const CUSTOM_RULE =
  /\b(forbidigo|depguard|gomodguard|ruleguard|no-restricted-(imports|syntax|globals|properties|modules)|noRestricted(Imports|Globals|Elements)|banned-api|banned-module-level-imports|disallowed(Function|Method|Static)Calls|Forbidden(MethodCall|Import))\b|\.grit\b|rulesdir|eslint-plugin-local/;

const customLintRules: Criterion = {
  id: "custom-lint-rules",
  name: "Project-specific lint rules",
  description:
    "The linter carries rules of the project's own, such as banned calls or imports (forbidigo, depguard, no-restricted-imports, Biome noRestrictedImports, ruff banned-api, Semgrep).",
  pillarId: "style-linting",
  level: 4,
  requiresLLM: false,
  check: async (repoPath) => {
    const [semgrep] = await fg(["**/.semgrep.{yml,yaml}", "**/.semgrep/**/*.{yml,yaml}"], { cwd: repoPath, ignore: IGNORE, dot: true, deep: 5 });
    if (semgrep) {
      return { criterionId: "custom-lint-rules", pass: true, message: `Semgrep rules found: ${semgrep}` };
    }
    const configs = await fg(CUSTOM_RULE_FILES, { cwd: repoPath, ignore: IGNORE, dot: true, deep: 4 });
    const texts = await readAll(repoPath, configs);
    for (const [i, text] of texts.entries()) {
      const hit = text.match(CUSTOM_RULE);
      if (hit) {
        return { criterionId: "custom-lint-rules", pass: true, message: `${hit[0]} in ${configs[i]}` };
      }
    }
    return {
      criterionId: "custom-lint-rules",
      pass: false,
      message: "No project-specific lint rules found.",
      details:
        "Whenever you correct an agent, turn the correction into a check: ban the call or import with forbidigo, depguard, no-restricted-imports, Biome noRestrictedImports, ruff banned-api or a Semgrep rule, with a message that points to the right way. A rule enforces; a line in AGENTS.md only asks.",
    };
  },
};

// Manifest entries and files that mean property-based, fuzz or formal verification.
const VERIFICATION_DEPS =
  /fast-check|@fast-check\/|\bhypothesis\b|atheris|pgregory\.net\/rapid|leanovate\/gopter|\bproptest\b|\bquickcheck\b|\bbolero\b|jqwik|kotest-property|FsCheck|CsCheck|giorgiosironi\/eris|\brantly\b|propcheck/;
const VERIFICATION_MANIFESTS = "**/{package.json,go.mod,Cargo.toml,pyproject.toml,requirements*.txt,build.gradle,build.gradle.kts,pom.xml,*.csproj,composer.json,Gemfile}";

const verification: Criterion = {
  id: "property-or-formal-verification",
  name: "Property-based, fuzz or formal verification",
  description:
    "Beyond example tests: property-based tests (fast-check, Hypothesis, rapid, proptest, jqwik), fuzz tests, or formal models (TLA+, Lean, Alloy, Dafny).",
  pillarId: "testing",
  level: 5,
  requiresLLM: false,
  check: async (repoPath) => {
    const [formal] = await fg(["**/*.{tla,als,dfy}", "**/lakefile.{lean,toml}"], { cwd: repoPath, ignore: IGNORE, deep: 6 });
    if (formal) {
      return { criterionId: "property-or-formal-verification", pass: true, message: `Formal verification found: ${formal}` };
    }
    const manifests = await fg(VERIFICATION_MANIFESTS, { cwd: repoPath, ignore: IGNORE, deep: 4 });
    for (const [i, text] of (await readAll(repoPath, manifests)).entries()) {
      const hit = text.match(VERIFICATION_DEPS);
      if (hit) {
        return { criterionId: "property-or-formal-verification", pass: true, message: `${hit[0]} in ${manifests[i]}` };
      }
    }
    const [fuzzDir] = await fg(["**/fuzz/Cargo.toml"], { cwd: repoPath, ignore: IGNORE, deep: 5 });
    if (fuzzDir) {
      return { criterionId: "property-or-formal-verification", pass: true, message: `cargo-fuzz found: ${fuzzDir}` };
    }
    const goTests = (await fg("**/*_test.go", { cwd: repoPath, ignore: IGNORE })).slice(0, MAX_FILES);
    for (const [i, text] of (await readAll(repoPath, goTests)).entries()) {
      if (/^func Fuzz[A-Z_]\w*\(/m.test(text) || text.includes('"testing/quick"')) {
        return { criterionId: "property-or-formal-verification", pass: true, message: `Go fuzz or property test in ${goTests[i]}` };
      }
    }
    return {
      criterionId: "property-or-formal-verification",
      pass: false,
      message: "No property-based, fuzz or formal verification found.",
      details:
        "Agents make these cheap to write and maintain. Add property-based tests (fast-check, Hypothesis, rapid, proptest), Go fuzz tests, or a TLA+ model of a critical flow, so an agent's change is checked against invariants and not only against the examples it saw.",
    };
  },
};

const runtimeVerification: Criterion = {
  id: "runtime-verification",
  name: "Runtime verification skill",
  description:
    "An agent skill that drives the real app the way a user does and captures evidence (.claude/skills/verify-*, .cursor/skills/verify-* and the like), ideally with a feature map.",
  pillarId: "testing",
  level: 4,
  requiresLLM: false,
  check: async (repoPath) => {
    const skills = await fg(["**/.{claude,cursor,agents,codex,github}/skills/{verify,verification}*/SKILL.md"], {
      cwd: repoPath,
      ignore: IGNORE,
      dot: true,
      deep: 8,
    });
    if (skills.length > 0) {
      const dir = skills[0].slice(0, -"SKILL.md".length);
      const [map] = await fg([`${dir}features/**/*.md`], { cwd: repoPath, dot: true });
      return {
        criterionId: "runtime-verification",
        pass: true,
        message: map ? `Verification skill with a feature map: ${dir}` : `Verification skill: ${dir} (no feature map yet)`,
      };
    }
    return {
      criterionId: "runtime-verification",
      pass: false,
      message: "No verification skill found.",
      details:
        "Give agents one scripted way to launch the real app, drive a feature the way a user does, and capture evidence (screenshots, transcripts, responses), as a skill such as .claude/skills/verify-<app>/SKILL.md with a feature map in features/. Review then becomes reading that evidence. For Cursor, pstack's /create-verification-skill generates one.",
    };
  },
};

const AGENT_FILES = ["AGENTS.md", "CLAUDE.md", ".cursorrules", ".github/copilot-instructions.md", "**/AGENTS.md", "**/CLAUDE.md", ".cursor/rules/**/*.{md,mdc}"];

/** Characters of rule sentences per model call; large repositories take several calls. */
export const RULES_BATCH = 80_000;
/** At most this many calls; rule sentences beyond them are left out by file. */
export const MAX_RULE_BATCHES = 6;
const ENFORCERS_BUDGET = 15_000;

const HARD_RULE = /\b(never|must|always|do not|don't|forbidden|required|refuses?|only (?:via|through|use))\b/i;

const HOOK_FILES = [".claude/hooks/**/*", ".husky/*", ".githooks/*", "lefthook.yml", ".lefthook.yml", ".pre-commit-config.yaml", "**/*install*hook*.{sh,bash,py}"];
const LINT_CONFIGS = ["**/.golangci.{yml,yaml,toml,json}", "**/{eslint.config.*,.eslintrc,.eslintrc.*}", "**/biome.{json,jsonc}", "**/{pyproject.toml,ruff.toml,.ruff.toml}", "**/.semgrep.{yml,yaml}", "**/.semgrep/**/*.{yml,yaml}"];
const LINT_RULE_LINE = /pattern:|msg:|no-restricted|noRestricted|banned-api|depguard|forbidigo|ruleguard|message:/;
const CI_FILES = [".github/workflows/*.{yml,yaml}", ".gitlab-ci.yml", ".circleci/config.yml"];
const CHECK_SCRIPTS = ["**/{check,verify,lint,guard,assert}-*.{sh,py,pl,ts,js,go}", "**/*-guard.{sh,py,pl,ts,js}"];

/** The sentences of an instruction file that state a hard rule, each cut to 300 characters. */
export function ruleSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-Z*`])/)
    .map((s) => s.replace(/^[\s>*#|-]+/, "").trim())
    .filter((s) => s.length > 0 && HARD_RULE.test(s))
    .map((s) => (s.length > 300 ? `${s.slice(0, 297)}...` : s));
}

interface RuleBatches {
  batches: string[];
  files: number;
  rules: number;
  coverage: string;
}

/** Collects the hard-rule sentences of every agent file, root files first, in batches for the model. */
async function agentRules(repoPath: string): Promise<RuleBatches | null> {
  const files = [...new Set(await fg(AGENT_FILES, { cwd: repoPath, ignore: IGNORE, dot: true, deep: 8 }))].sort(
    (a, b) => Number(a.includes("/")) - Number(b.includes("/")) || a.localeCompare(b),
  );
  if (files.length === 0) return null;
  const texts = await readAll(repoPath, files);
  const batches: string[] = [];
  let current = "";
  let rules = 0;
  let read = 0;
  const left: string[] = [];
  for (const [i, f] of files.entries()) {
    const lines = ruleSentences(texts[i]).map((s) => `${f}: ${s}`);
    if (lines.length === 0) {
      read++;
      continue;
    }
    const block = `${lines.join("\n")}\n`;
    if (current.length + block.length > RULES_BATCH && current.length > 0) {
      batches.push(current);
      current = "";
    }
    if (batches.length >= MAX_RULE_BATCHES) {
      left.push(f);
      continue;
    }
    current += block.slice(0, RULES_BATCH);
    rules += lines.length;
    read++;
  }
  if (current.length > 0 && batches.length < MAX_RULE_BATCHES) batches.push(current);
  const coverage =
    `${rules.toLocaleString("en-US")} hard-rule sentences from ${read} of ${files.length} agent instruction files, in ${batches.length} ${batches.length === 1 ? "pass" : "passes"}` +
    (left.length > 0 ? `; ${left.length} files left out (${left.slice(0, 3).join(", ")}${left.length > 3 ? ", ..." : ""})` : "");
  return { batches, files: files.length, rules, coverage };
}

/** Lists what exists to enforce a rule: hooks, project lint rules, CI workflows and check scripts. */
async function enforcersContext(repoPath: string): Promise<string> {
  const glob = (patterns: string[], deep: number) => fg(patterns, { cwd: repoPath, ignore: IGNORE, dot: true, deep, onlyFiles: true });
  const hooks = await glob(HOOK_FILES, 5);
  const configs = await glob(LINT_CONFIGS, 4);
  const rules: string[] = [];
  for (const [i, text] of (await readAll(repoPath, configs)).entries()) {
    const lines = text.split("\n").map((l) => l.trim()).filter((l) => LINT_RULE_LINE.test(l));
    if (lines.length > 0) rules.push(`${configs[i]}:\n${lines.join("\n")}`);
  }
  const ci = await glob(CI_FILES, 3);
  const scripts = await glob(CHECK_SCRIPTS, 6);
  const out = [
    `Hooks:\n${hooks.join("\n") || "(none)"}`,
    `Project lint rules:\n${rules.join("\n") || "(none)"}`,
    `CI workflows:\n${ci.join("\n") || "(none)"}`,
    `Check scripts:\n${scripts.join("\n") || "(none)"}`,
  ].join("\n\n");
  return out.slice(0, ENFORCERS_BUDGET);
}

const AGENT_RULES_PROMPT =
  "Below are the hard-rule sentences (things an agent must or must not do) from a repository's agent instruction files, each prefixed with its file, followed by the ENFORCERS that exist in the repository: hooks, project lint rules, CI workflows and check scripts. A rule counts as enforced when its sentence names what enforces it, or when an enforcer plausibly enforces it by name or pattern. Ignore sentences that are not rules for an agent (descriptions of runtime behaviour, for example). Pass when nearly all rules are enforced and the rest is judgment a check cannot make. Fail when many rules have no enforcer. In the details, list the rules with no enforcer (with their file), then separately the ones that are enforced but whose sentence does not say by what.";

const enforcedAgentRules: Criterion = {
  id: "enforced-agent-rules",
  name: "Agent rules are enforced (AI)",
  description:
    "The hard rules in the agent instruction files are backed by something that fails (a lint rule, a type, a test, a hook, a CI check).",
  pillarId: "documentation",
  level: 5,
  requiresLLM: true,
  check: async (repoPath, _projectInfo, llmClient) => {
    if (!llmClient) {
      return { criterionId: "enforced-agent-rules", pass: false, message: "Unable to evaluate agent rules." };
    }
    const agent = await agentRules(repoPath);
    if (!agent) {
      return { criterionId: "enforced-agent-rules", pass: false, message: "No agent instruction files to evaluate." };
    }
    if (agent.rules === 0) {
      return { criterionId: "enforced-agent-rules", pass: true, message: `No hard rules found in ${agent.files} agent instruction files.` };
    }
    const enforcers = await enforcersContext(repoPath);
    const results = [];
    for (const [i, batch] of agent.batches.entries()) {
      const part = agent.batches.length > 1 ? ` (part ${i + 1} of ${agent.batches.length})` : "";
      results.push(await llmClient.evaluate(AGENT_RULES_PROMPT, `Rules${part}:\n${batch}\n=== ENFORCERS ===\n${enforcers}`));
    }
    const pass = results.every((r) => r.pass);
    const failed = results.filter((r) => !r.pass).length;
    const message =
      results.length === 1
        ? `${results[0].message} (${agent.coverage}.)`
        : `${pass ? "All" : `${results.length - failed} of`} ${results.length} parts pass. (${agent.coverage}.)`;
    const details = results
      .map((r, i) => (results.length > 1 ? `Part ${i + 1}: ${r.message}\n${r.details ?? ""}` : (r.details ?? "")))
      .join("\n\n")
      .trim();
    return { criterionId: "enforced-agent-rules", pass, message, ...(details ? { details } : {}) };
  },
};

// Comments: an agent copies a comment as readily as code, and a comment is where it
// justifies a quick fix ("it would be a larger change"). The talk's team removed 99%.

const HASH_COMMENTS = new Set(["py", "rb"]);

/** Comment lines above this share of code lines fail comment-density. */
export const COMMENT_LIMIT = 0.1;
/** Workaround comments per 1,000 lines above this fail workaround-comments. */
export const WORKAROUND_LIMIT = 1;

const WORKAROUND =
  /\b(workaround|for now|temporar(y|ily)|hack(y|ish)?|quick fix|in case it|larger change|do not remove|don't remove)\b/i;

interface FileComments {
  file: string;
  comments: number;
  code: number;
  workarounds: number;
}

function isCommentLine(line: string, ext: string): boolean {
  if (line.startsWith("//") || line.startsWith("/*") || line.startsWith("*")) return !HASH_COMMENTS.has(ext);
  if (line.startsWith("#") && !line.startsWith("#!") && !line.startsWith("#[")) {
    return HASH_COMMENTS.has(ext) || ext === "php";
  }
  return false;
}

/** Counts comment, code and workaround lines in a file; the comment block it opens with (licence, package doc) is left out of the comments. */
function countComments(file: string, text: string): FileComments {
  const ext = file.slice(file.lastIndexOf(".") + 1);
  const out: FileComments = { file, comments: 0, code: 0, workarounds: 0 };
  let inBlock = false;
  let header = true;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (line === "") continue;
    const comment = inBlock || isCommentLine(line, ext);
    if (!inBlock && line.startsWith("/*") && !HASH_COMMENTS.has(ext) && !line.includes("*/")) inBlock = true;
    else if (inBlock && line.includes("*/")) inBlock = false;
    if (!comment) {
      header = false;
      out.code++;
      continue;
    }
    // A workaround comment counts wherever it is; the header only stays out of the density.
    if (WORKAROUND.test(line)) out.workarounds++;
    if (!header) out.comments++;
  }
  return out;
}

async function scanComments(repoPath: string): Promise<FileComments[]> {
  const files = (await fg(SOURCE, { cwd: repoPath, ignore: IGNORE, dot: false })).slice(0, MAX_FILES);
  const texts = await readAll(repoPath, files);
  return files.map((f, i) => countComments(f, texts[i]));
}

function worst(files: FileComments[], key: "comments" | "workarounds"): string {
  return [...files]
    .filter((f) => f[key] > 0)
    .sort((a, b) => b[key] - a[key])
    .slice(0, 5)
    .map((f) => `${f.file} (${f[key]})`)
    .join(", ");
}

const commentDensity: Criterion = {
  id: "comment-density",
  name: "Few comments",
  description: `Comment lines are at most ${COMMENT_LIMIT * 100}% of code lines (the header block a file opens with is excluded).`,
  pillarId: "code-health",
  level: 4,
  requiresLLM: false,
  check: async (repoPath) => {
    const files = await scanComments(repoPath);
    const comments = files.reduce((n, f) => n + f.comments, 0);
    const code = files.reduce((n, f) => n + f.code, 0);
    if (code === 0) return { criterionId: "comment-density", pass: true, message: "No source files to check." };
    const share = comments / code;
    const message = `${comments.toLocaleString("en-US")} comment lines for ${code.toLocaleString("en-US")} lines of code (${(share * 100).toFixed(1)}%).`;
    if (share <= COMMENT_LIMIT) return { criterionId: "comment-density", pass: true, message };
    return {
      criterionId: "comment-density",
      pass: false,
      message,
      details: `Most comments: ${worst(files, "comments")}. Comments go stale, nothing enforces them, and an agent copies them as the local pattern. Keep the few that say why the code cannot; turn rules into lint checks or types, and let names say the rest.`,
    };
  },
};

const workaroundComments: Criterion = {
  id: "workaround-comments",
  name: "No workaround comments",
  description: `At most ${WORKAROUND_LIMIT} comment per 1,000 lines that justifies a workaround ("workaround", "for now", "temporary", "hack", "in case it", "do not remove").`,
  pillarId: "code-health",
  level: 3,
  requiresLLM: false,
  check: async (repoPath) => {
    const files = await scanComments(repoPath);
    const found = files.reduce((n, f) => n + f.workarounds, 0);
    const lines = files.reduce((n, f) => n + f.code + f.comments, 0);
    if (lines === 0) return { criterionId: "workaround-comments", pass: true, message: "No source files to check." };
    const perK = (found / lines) * 1000;
    const message = `${found} workaround comments in ${lines.toLocaleString("en-US")} lines (${perK.toFixed(2)} per 1,000).`;
    if (perK <= WORKAROUND_LIMIT) return { criterionId: "workaround-comments", pass: true, message };
    return {
      criterionId: "workaround-comments",
      pass: false,
      message,
      details: `Most in: ${worst(files, "workarounds")}. A comment that explains why a quick fix is fine is how the fix spreads: the next agent copies both. Fix the root cause and delete the comment; where it must stay, encode it as a lint rule or a test.`,
    };
  },
};

export const guardrailCodeHealthCriteria: Criterion[] = [commentDensity, workaroundComments];

export const guardrailStyleCriteria: Criterion[] = [lintSuppressions, customLintRules];
export const guardrailTestingCriteria: Criterion[] = [runtimeVerification, verification];
export const guardrailDocumentationCriteria: Criterion[] = [enforcedAgentRules];
