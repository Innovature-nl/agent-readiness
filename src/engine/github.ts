import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Repository settings that live in GitHub, not in the files, read with the gh CLI. */
export interface GitHubSettings {
  repo: string;
  defaultBranch: string;
  /** Classic protection or rulesets on the default branch. */
  branchProtected: boolean;
  /** Ruleset rule types on the default branch, e.g. pull_request, non_fast_forward. */
  branchRules: string[];
  secretScanning: boolean;
  pushProtection: boolean;
  dependabotSecurityUpdates: boolean;
  codeScanning: boolean;
}

async function gh(args: string[]): Promise<string> {
  const { stdout } = await run("gh", args, { maxBuffer: 10 * 1024 * 1024 });
  return stdout.trim();
}

async function ghJson<T>(path: string): Promise<T | null> {
  try {
    return JSON.parse(await gh(["api", path])) as T;
  } catch {
    // 403/404 mean the feature is off or not visible to this token
    return null;
  }
}

/** owner/name from the origin remote, for https and ssh GitHub URLs. */
export function parseGitHubRemote(url: string): string | null {
  const match = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(\.git)?\/?$/.exec(url.trim());
  return match ? `${match[1]}/${match[2]}` : null;
}

export async function detectGitHubRepo(repoPath: string): Promise<string | null> {
  try {
    const { stdout } = await run("git", ["-C", repoPath, "remote", "get-url", "origin"]);
    return parseGitHubRemote(stdout);
  } catch {
    return null;
  }
}

export async function fetchGitHubSettings(repo: string): Promise<GitHubSettings> {
  const meta = await ghJson<{
    default_branch: string;
    security_and_analysis?: Record<string, { status?: string }>;
  }>(`repos/${repo}`);
  if (!meta) throw new Error(`Cannot read ${repo} with gh. Run "gh auth status" and check access to the repository.`);

  const branch = meta.default_branch;
  const [branchInfo, rules, codeScanning] = await Promise.all([
    ghJson<{ protected?: boolean }>(`repos/${repo}/branches/${encodeURIComponent(branch)}`),
    ghJson<Array<{ type: string }>>(`repos/${repo}/rules/branches/${encodeURIComponent(branch)}`),
    ghJson<{ state?: string }>(`repos/${repo}/code-scanning/default-setup`),
  ]);
  const sa = meta.security_and_analysis ?? {};
  const enabled = (key: string) => sa[key]?.status === "enabled";
  const branchRules = [...new Set((rules ?? []).map((r) => r.type))].sort();

  return {
    repo,
    defaultBranch: branch,
    branchProtected: Boolean(branchInfo?.protected) || branchRules.length > 0,
    branchRules,
    secretScanning: enabled("secret_scanning"),
    pushProtection: enabled("secret_scanning_push_protection"),
    dependabotSecurityUpdates: enabled("dependabot_security_updates"),
    codeScanning: codeScanning?.state === "configured",
  };
}
