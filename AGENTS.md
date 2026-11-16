# AGENTS.md

Agent Readiness is a Bun + TypeScript CLI that scores how ready a repository is for AI coding agents, with a React dashboard in `web/`. `README.md` describes the product and every check; `ARCHITECTURE.md` how the code fits together.

## Commands

```sh
bun install
bun run dev -- /path/to/repo   # run the CLI from source
bun test                       # all tests; bun test tests/pillars/testing.test.ts for one file
bun run typecheck
bun run lint                   # Biome; bun run format applies the safe fixes
bun run build:all              # CLI to dist/, dashboard to dist/web
```

Run `typecheck`, `lint`, `knip` and `test` before you push; CI runs the same plus the build and `bun run size`. After a change you can see from the outside, run the matching feature of `.agents/skills/verify-agent-readiness/`.

## Adding or changing a check

- A check is a criterion in the right pillar under `src/pillars/`, with an `id`, `level` and a `check` function that returns a `CriterionResult`.
- Every check gets tests under `tests/pillars/`, at least one passing and one failing fixture. Build fixtures with `createTestDir` and `writeFixtures` from `tests/helpers.ts`.
- A check that only makes sense for code goes in `CODE_ONLY` in `src/pillars/applicability.ts`, so infra and docs repositories get N/A instead of a fail.
- Give the failing result a `details` line that says how to fix it, and add a recommendation in `src/engine/recommender.ts`.
- Update the check list and counts in `README.md`.

## Rules

- Checks read files only. They never run the scanned repository's code or tools.
- Never send repository content anywhere except the configured LLM, and only for the checks marked `requiresLLM`.
- The dashboard server listens on 127.0.0.1 only, because org scans run with the user's `gh` login.
- Pin GitHub Actions to a commit SHA with the version as a comment.
