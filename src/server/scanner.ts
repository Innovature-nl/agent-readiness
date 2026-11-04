import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";

const run = promisify(execFile);

export interface OrgRepo {
  name: string;
  description: string;
  pushedAt: string;
}

export interface ScanStatus {
  running: boolean;
  current: string | null;
  queue: string[];
  done: string[];
  failed: Array<{ name: string; error: string }>;
}

export interface ScanServiceOptions {
  org: string;
  historyDir: string;
  cacheDir: string;
  profile: string;
  ai: boolean;
}

const LIST_TTL_MS = 5 * 60 * 1000;

/**
 * Lists the repositories of a GitHub organization and scans the ones the dashboard asks for:
 * a shallow clone (or refresh) into the cache directory, then this CLI with --history, so
 * the result lands in the same history the dashboard reads.
 */
export function createScanService(options: ScanServiceOptions) {
  let listCache: { at: number; repos: OrgRepo[] } | null = null;
  const status: ScanStatus = { running: false, current: null, queue: [], done: [], failed: [] };

  async function listRepos(): Promise<OrgRepo[]> {
    if (listCache && Date.now() - listCache.at < LIST_TTL_MS) return listCache.repos;
    const { stdout } = await run(
      "gh",
      ["repo", "list", options.org, "--limit", "1000", "--no-archived", "--json", "name,description,pushedAt"],
      { maxBuffer: 20 * 1024 * 1024 },
    );
    const repos = (JSON.parse(stdout) as OrgRepo[]).sort((a, b) => a.name.localeCompare(b.name));
    listCache = { at: Date.now(), repos };
    return repos;
  }

  async function checkout(name: string): Promise<string> {
    const dir = path.join(options.cacheDir, name);
    if (fs.existsSync(path.join(dir, ".git"))) {
      await run("git", ["-C", dir, "fetch", "--depth", "1", "origin", "HEAD"]);
      await run("git", ["-C", dir, "reset", "--hard", "FETCH_HEAD"]);
    } else {
      fs.mkdirSync(options.cacheDir, { recursive: true });
      await run("gh", ["repo", "clone", `${options.org}/${name}`, dir, "--", "--depth", "1", "--no-recurse-submodules", "-q"], {
        maxBuffer: 20 * 1024 * 1024,
      });
    }
    return dir;
  }

  async function scanOne(name: string): Promise<void> {
    const dir = await checkout(name);
    const args = [
      process.argv[1],
      dir,
      "--no-web",
      "--format", "json",
      "--history", options.historyDir,
      "--profile", options.profile,
      "--github", `${options.org}/${name}`,
      ...(options.ai ? ["--ai", "--ai-provider", "claude"] : []),
    ];
    await run(process.execPath, args, { timeout: 15 * 60 * 1000, maxBuffer: 50 * 1024 * 1024 });
  }

  async function drain(onScanned: () => void): Promise<void> {
    status.running = true;
    while (status.queue.length > 0) {
      const name = status.queue.shift()!;
      status.current = name;
      try {
        await scanOne(name);
        status.done.push(name);
        onScanned();
      } catch (err) {
        const message = err instanceof Error ? err.message.split("\n")[0] : String(err);
        status.failed.push({ name, error: message });
      }
    }
    status.current = null;
    status.running = false;
  }

  /** Queues repositories of the org; names that are not in the org are rejected. */
  async function start(names: string[], onScanned: () => void = () => {}): Promise<ScanStatus> {
    const known = new Set((await listRepos()).map((r) => r.name));
    const unknown = names.filter((n) => !known.has(n));
    if (unknown.length) throw new Error(`Not in ${options.org}: ${unknown.join(", ")}`);
    if (!status.running) {
      status.done = [];
      status.failed = [];
    }
    for (const name of names) if (name !== status.current && !status.queue.includes(name)) status.queue.push(name);
    if (!status.running) void drain(onScanned);
    return status;
  }

  return { org: options.org, listRepos, start, status: () => status };
}

export type ScanService = ReturnType<typeof createScanService>;
