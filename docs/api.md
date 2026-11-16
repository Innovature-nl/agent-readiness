# API

Agent Readiness has two interfaces for other programs: the JSON report of the CLI and the HTTP API of the dashboard server. Both are read by the dashboard in `web/`, so a change to either has to keep it working.

## JSON report

`agent-readiness <path> --format json` prints one object (`SerializedReportData` in `src/engine/serializer.ts`):

| Field | Content |
|-------|---------|
| `repoName`, `repoPath` | The scanned repository |
| `projectInfo` | Detected types, monorepo packages and, with `--github`, the GitHub settings |
| `pillars` | Every pillar with its criteria: `id`, `name`, `description`, `level`, `requiresLLM` |
| `results` | Per pillar id, a list of `{ criterionId, pass, message, details?, skipped? }`; `skipped` marks N/A and AI checks that did not run |
| `levelResult` | `level` (1 to 5) and `nextLevelProgress` (`current`, `needed`, `remaining`, `nextLevel`) |
| `pillarScores` | Per pillar: `passed`, `total`, `percentage` |
| `recommendations` | Fixes for failed checks: `title`, `description`, `reason`, `effort`, `impact`, `pillarId`, `criterionId` |
| `packageScores` | Monorepos only, otherwise empty: per package `path`, `passed`, `total`, `percentage` and `results` for the package-scoped checks |

With `--history <dir>` the same scan is also stored as a snapshot in `<dir>/<repo>/<timestamp>.json` (`Snapshot` in `src/engine/history.ts`).

## Dashboard HTTP API

The server (`src/server/index.ts`) listens on 127.0.0.1 only.

| Method and path | Returns |
|-----------------|---------|
| `GET /api/summary` | The report of a single scan, or for `org` the organization summary (`OrgSummary` in `src/engine/history.ts`) |
| `GET /api/report.md` | The single-repository report as Markdown; 404 in `org` mode |
| `GET /api/github/repos` | `{ org, repos }`: the organization's repositories. Only with `--github-org` |
| `GET /api/scan` | The scan queue: `running`, `current`, `queue`, `done`, `failed`. Only with `--github-org` |
| `POST /api/scan` | Body `{ "repos": ["name", ...] }` with `Content-Type: application/json`; queues the scans and returns 202 with the status. Only with `--github-org` |

`POST /api/scan` refuses any other content type (415). A JSON content type forces a CORS preflight that the server never answers, so another website cannot start a scan in the background.
