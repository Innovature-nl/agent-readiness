import { useEffect, useRef, useState } from "react";

const STORAGE_KEY = "kodus-org-excluded-repos";
const ORG_LIST_LIMIT = 40;

/** Excluded rather than included names, so a newly scanned repository shows up by default. */
export function useExcludedRepos(): [Set<string>, (next: Set<string>) => void] {
  const [excluded, setState] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]") as string[]);
    } catch {
      return new Set();
    }
  });
  const set = (next: Set<string>) => {
    setState(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([...next]));
    } catch {
      // Storage can be blocked; the selection then lasts until the page reloads.
    }
  };
  return [excluded, set];
}

interface OrgRepo {
  name: string;
  description: string;
  pushedAt: string;
}

interface ScanStatus {
  running: boolean;
  current: string | null;
  queue: string[];
  done: string[];
  failed: Array<{ name: string; error: string }>;
}

interface Props {
  names: string[];
  excluded: Set<string>;
  onChange: (next: Set<string>) => void;
  github?: { org: string; ai: boolean };
  onScanned: () => void;
}

const chip = "flex items-center gap-2 px-2 py-1 rounded-md border text-sm cursor-pointer";

export default function RepoPicker({ names, excluded, onChange, github, onScanned }: Props) {
  const [query, setQuery] = useState("");
  const q = query.trim().toLowerCase();
  const shown = names.filter((n) => n.toLowerCase().includes(q));
  const included = names.length - names.filter((n) => excluded.has(n)).length;

  const toggle = (name: string) => {
    const next = new Set(excluded);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  };

  return (
    <details className="bg-surface-card border border-surface-border rounded-xl p-6" open={excluded.size > 0 || names.length === 0}>
      <summary className="text-sm font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">
        Repositories in this view: {included} of {names.length}
      </summary>
      <p className="text-xs text-gray-500 mt-3 mb-3">
        Untick a repository to leave it out of every number on this page. The choice is saved in this browser.
        {github && ` Search also finds repositories in ${github.org} that have not been scanned yet.`}
      </p>
      <div className="flex flex-wrap items-center gap-3 mb-3 text-xs">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={github ? `Search ${github.org} repositories` : "Search repositories"}
          aria-label="Search repositories"
          className="bg-surface-elevated border border-surface-border rounded-md px-3 py-1.5 text-sm text-gray-200 w-72 max-w-full"
        />
        {/* The buttons act on the repositories that match the search, so you can add or drop a group at once. */}
        <button type="button" className="text-accent hover:text-accent-light" onClick={() => onChange(new Set([...excluded].filter((n) => !shown.includes(n))))}>
          Select {query ? "matches" : "all"}
        </button>
        <button type="button" className="text-accent hover:text-accent-light" onClick={() => onChange(new Set([...excluded, ...shown]))}>
          Deselect {query ? "matches" : "all"}
        </button>
      </div>
      {names.length > 0 && shown.length === 0 && <p className="text-sm text-gray-500">No scanned repository matches "{query}".</p>}
      <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
        {shown.map((name) => (
          <label key={name} className={`${chip} border-surface-border text-gray-300 hover:border-accent/50`}>
            <input type="checkbox" checked={!excluded.has(name)} onChange={() => toggle(name)} className="accent-amber-500" />
            {name}
          </label>
        ))}
      </div>
      {github && (
        <GitHubScan
          org={github.org}
          ai={github.ai}
          query={q}
          scanned={names}
          inView={names.filter((n) => !excluded.has(n))}
          onScanned={onScanned}
        />
      )}
    </details>
  );
}

function GitHubScan({
  org,
  ai,
  query,
  scanned,
  inView,
  onScanned,
}: {
  org: string;
  ai: boolean;
  query: string;
  scanned: string[];
  inView: string[];
  onScanned: () => void;
}) {
  const [repos, setRepos] = useState<OrgRepo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<ScanStatus | null>(null);
  const seenDone = useRef(0);

  useEffect(() => {
    fetch("/api/github/repos")
      .then(async (r) => (r.ok ? r.json() : Promise.reject(new Error((await r.json()).error ?? r.statusText))))
      .then((body: { repos: OrgRepo[] }) => setRepos(body.repos))
      .catch((e: Error) => setError(e.message));
    fetch("/api/scan")
      .then((r) => (r.ok ? r.json() : null))
      .then((s: ScanStatus | null) => s && setStatus(s))
      .catch(() => {});
  }, []);

  // Poll while a scan runs; refresh the dashboard each time another repository finishes.
  useEffect(() => {
    if (!status?.running) return;
    const timer = setInterval(async () => {
      try {
        const next = (await (await fetch("/api/scan")).json()) as ScanStatus;
        if (next.done.length !== seenDone.current) {
          seenDone.current = next.done.length;
          onScanned();
        }
        setStatus(next);
      } catch {
        // Keep polling; the server may be busy.
      }
    }, 3000);
    return () => clearInterval(timer);
  }, [status?.running, onScanned]);

  const start = async (names: string[]) => {
    setError(null);
    seenDone.current = 0;
    const r = await fetch("/api/scan", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ repos: names }),
    });
    const body = await r.json();
    if (!r.ok) return setError(body.error ?? r.statusText);
    setStatus(body as ScanStatus);
    setSelected(new Set());
  };

  const scannedSet = new Set(scanned);
  const candidates = (repos ?? [])
    .filter((r) => !scannedSet.has(r.name) && r.name.toLowerCase().includes(query))
    .sort((a, b) => b.pushedAt.localeCompare(a.pushedAt));
  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    setSelected(next);
  };

  return (
    <div className="mt-5 pt-4 border-t border-surface-border">
      <div className="flex flex-wrap items-center gap-3 mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Not scanned yet in {org}</h3>
        <button
          type="button"
          disabled={selected.size === 0}
          onClick={() => start([...selected])}
          className="text-xs px-2.5 py-1 rounded-md bg-accent/15 text-accent border border-accent/40 disabled:opacity-40"
        >
          Scan {selected.size || ""} selected
        </button>
        <button
          type="button"
          disabled={inView.length === 0 || status?.running}
          onClick={() => start(inView)}
          className="text-xs text-accent hover:text-accent-light disabled:opacity-40"
        >
          Rescan the {inView.length} in view
        </button>
      </div>
      <p className="text-xs text-gray-500 mb-3">
        A scan clones the repository, checks it with the GitHub settings{ai ? " and the AI checks (about a minute and a half each)" : ""}, and adds it to this view.
      </p>
      {error && <p className="text-sm text-fail mb-2">{error}</p>}
      {status && (status.running || status.done.length > 0 || status.failed.length > 0) && (
        <p className="text-sm text-gray-300 mb-3" role="status">
          {status.running
            ? `Scanning ${status.current}${status.queue.length ? `, ${status.queue.length} waiting` : ""}. `
            : "Scan finished. "}
          {status.done.length > 0 && `Done: ${status.done.length}. `}
          {status.failed.length > 0 && (
            <span className="text-fail">Failed: {status.failed.map((f) => `${f.name} (${f.error})`).join("; ")}</span>
          )}
        </p>
      )}
      {!repos && !error && <p className="text-sm text-gray-500">Loading repositories from {org}...</p>}
      {repos && (
        <>
          <div className="flex flex-wrap gap-2 max-h-64 overflow-y-auto">
            {candidates.slice(0, ORG_LIST_LIMIT).map((r) => (
              <label
                key={r.name}
                title={r.description || undefined}
                className={`${chip} ${selected.has(r.name) ? "border-accent/60 text-white" : "border-dashed border-surface-border text-gray-400"} hover:border-accent/50`}
              >
                <input type="checkbox" checked={selected.has(r.name)} onChange={() => toggle(r.name)} className="accent-amber-500" />
                {r.name}
              </label>
            ))}
          </div>
          <p className="text-xs text-gray-500 mt-2">
            {candidates.length > ORG_LIST_LIMIT
              ? `Showing the ${ORG_LIST_LIMIT} most recently pushed of ${candidates.length}; search to find others.`
              : candidates.length === 0
                ? query ? `No unscanned repository in ${org} matches "${query}".` : `Every repository in ${org} has been scanned.`
                : `${candidates.length} repositories.`}
          </p>
        </>
      )}
    </div>
  );
}
