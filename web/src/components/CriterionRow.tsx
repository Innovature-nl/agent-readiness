import { useState } from "react";
import type { CriterionResult } from "../types";

/** Details longer than this start collapsed; AI checks can return a page of text. */
const COLLAPSE_AT = 280;

function Details({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const long = text.length > COLLAPSE_AT;
  const shown = long && !open ? `${text.slice(0, COLLAPSE_AT).trimEnd()}…` : text;
  return (
    <div className="mt-0.5">
      <p className="text-xs text-gray-500 whitespace-pre-line break-words">{shown}</p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="text-xs text-cyan-500 hover:text-cyan-400 mt-0.5"
        >
          {open ? "Show less" : `Show all (${text.length.toLocaleString("en-US")} characters)`}
        </button>
      )}
    </div>
  );
}

interface Props {
  result: CriterionResult;
}

export default function CriterionRow({ result }: Props) {
  const icon = result.skipped ? (
    <span className="text-skip text-base" title="Skipped (requires --ai)">
      &#9675;
    </span>
  ) : result.pass ? (
    <span className="text-pass text-base" title="Pass">
      &#10003;
    </span>
  ) : (
    <span className="text-fail text-base" title="Fail">
      &#10007;
    </span>
  );

  return (
    <div className="flex items-start gap-2 py-1.5">
      <div className="w-5 flex-shrink-0 text-center mt-0.5">{icon}</div>
      <div className="flex-1 min-w-0">
        <p
          className={`text-sm ${
            result.skipped
              ? "text-gray-500"
              : result.pass
                ? "text-gray-300"
                : "text-gray-300"
          }`}
        >
          {result.message}
        </p>
        {result.skipped && (
          <p className="text-xs text-cyan-500/70 mt-0.5">requires --ai</p>
        )}
        {!result.pass && !result.skipped && result.details && (
          <Details text={result.details} />
        )}
      </div>
    </div>
  );
}
