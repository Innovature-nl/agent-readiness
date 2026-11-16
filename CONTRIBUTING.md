# Contributing

Issues and pull requests are welcome. For a security problem, follow [SECURITY.md](SECURITY.md) instead of opening an issue.

## Setup

You need [Bun](https://bun.sh) and, for the GitHub checks, the [GitHub CLI](https://cli.github.com). A dev container is in `.devcontainer/`.

```bash
bun install
pre-commit install               # optional: gitleaks, Biome and the typecheck on every commit
bun run dev -- /path/to/repo     # run the CLI from source
bun run dev:web                  # dashboard in dev mode
```

## Before you open a pull request

```bash
bun run typecheck
bun run lint                     # bun run format applies the safe fixes
bun run knip                     # unused files, exports and dependencies
bun test
bun run build:all && bun run size
```

CI runs the same. For a change you can see from the outside, run the matching steps in `.agents/skills/verify-agent-readiness/` and put the output in the pull request.

## Adding a check

A new check is a criterion in the right pillar under `src/pillars/`, with tests under `tests/pillars/`. [AGENTS.md](AGENTS.md) lists everything a check needs; [ARCHITECTURE.md](ARCHITECTURE.md) shows where it fits.

## Releases

Bump `version` in `package.json`, merge, and push a tag `v<version>`. The Release workflow builds the package and publishes a GitHub release with the tarball.
