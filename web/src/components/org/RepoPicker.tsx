import { useState } from "react";

const STORAGE_KEY = "kodus-org-excluded-repos";

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

interface Props {
  names: string[];
  excluded: Set<string>;
  onChange: (next: Set<string>) => void;
}

export default function RepoPicker({ names, excluded, onChange }: Props) {
  const toggle = (name: string) => {
    const next = new Set(excluded);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    onChange(next);
  };
  const included = names.length - names.filter((n) => excluded.has(n)).length;

  return (
    <details className="bg-surface-card border border-surface-border rounded-xl p-6" open={excluded.size > 0}>
      <summary className="text-sm font-semibold text-gray-400 uppercase tracking-wider cursor-pointer">
        Repositories in this view: {included} of {names.length}
      </summary>
      <p className="text-xs text-gray-500 mt-3 mb-3">
        Untick a repository to leave it out of every number on this page. The choice is saved in this browser.
      </p>
      <div className="flex gap-3 mb-3 text-xs">
        <button type="button" className="text-accent hover:text-accent-light" onClick={() => onChange(new Set())}>
          Select all
        </button>
        <button type="button" className="text-accent hover:text-accent-light" onClick={() => onChange(new Set(names))}>
          Select none
        </button>
      </div>
      <div className="flex flex-wrap gap-2">
        {names.map((name) => (
          <label
            key={name}
            className="flex items-center gap-2 px-2 py-1 rounded-md border border-surface-border text-sm text-gray-300 cursor-pointer hover:border-accent/50"
          >
            <input type="checkbox" checked={!excluded.has(name)} onChange={() => toggle(name)} className="accent-amber-500" />
            {name}
          </label>
        ))}
      </div>
    </details>
  );
}
