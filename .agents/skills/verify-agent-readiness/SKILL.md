---
name: verify-agent-readiness
description: Run the real Agent Readiness CLI and dashboard against a repository and capture evidence that a change works. Use after changing a check, the scorer, a renderer, the server or the dashboard, before saying the change is done.
---

# Verify Agent Readiness

Tests prove a check's logic on fixtures. This skill proves the tool still works as a user runs it. Pick the feature you changed in `features/`, run its steps, and put the evidence in the pull request.

## Setup

```sh
bun install
bun run build:all        # the dashboard is served from dist/web
EVIDENCE=$(mktemp -d)
```

Use this repository itself as the scan target unless the feature says otherwise; it exercises most checks.

## Rules

- Run from source (`bun src/index.ts`) so the evidence matches the code under review.
- Save every output to `$EVIDENCE` and quote the relevant part in the PR, not a summary of it.
- A step that fails is the result. Do not adjust the step until it passes.
- Stop the dashboard server when you are done.

## Features

| Feature | File |
|---------|------|
| Scan one repository (terminal, JSON, Markdown) | `features/scan.md` |
| History and the difference since the last scan | `features/history.md` |
| Dashboard and its API | `features/dashboard.md` |
