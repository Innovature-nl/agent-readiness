import { describe, test, expect } from "bun:test";
import { parseGitHubRemote, type GitHubSettings } from "../../src/engine/github.js";
import ciCd from "../../src/pillars/ci-cd.js";
import security from "../../src/pillars/security.js";
import { getCheck, mockProjectInfo } from "../helpers.js";

const settings = (overrides: Partial<GitHubSettings> = {}): GitHubSettings => ({
  repo: "acme/app",
  defaultBranch: "main",
  branchProtected: false,
  branchRules: [],
  secretScanning: false,
  pushProtection: false,
  dependabotSecurityUpdates: false,
  codeScanning: false,
  ...overrides,
});

describe("github", () => {
  test("parses https and ssh remotes", () => {
    expect(parseGitHubRemote("https://github.com/acme/web-app.git\n")).toBe("acme/web-app");
    expect(parseGitHubRemote("git@github.com:acme/handbook.git")).toBe("acme/handbook");
    expect(parseGitHubRemote("https://gitlab.com/acme/app.git")).toBeNull();
  });

  test("branch protection follows the GitHub settings", async () => {
    const check = getCheck(ciCd, "branch-protection");
    const on = await check("/nonexistent", mockProjectInfo({ github: settings({ branchProtected: true, branchRules: ["pull_request"] }) }));
    expect(on).toMatchObject({ pass: true });
    expect(on.message).toContain("pull_request");
    expect((await check("/nonexistent", mockProjectInfo({ github: settings() }))).pass).toBe(false);
  });

  test("secret scanning and dependabot settings count", async () => {
    const info = mockProjectInfo({ github: settings({ pushProtection: true, dependabotSecurityUpdates: true }) });
    expect((await getCheck(security, "secrets-detection")("/nonexistent", info)).pass).toBe(true);
    expect((await getCheck(security, "dep-update-automation")("/nonexistent", info)).pass).toBe(true);
  });
});
