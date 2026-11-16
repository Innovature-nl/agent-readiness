# Scan one repository

```sh
bun src/index.ts . --no-web --no-color > "$EVIDENCE/scan.txt"
bun src/index.ts . --no-web --format json > "$EVIDENCE/scan.json"
bun src/index.ts . --no-web --format markdown > "$EVIDENCE/scan.md"
```

Expect:

- `scan.txt` shows the level, a block per pillar and the recommendations.
- `jq '.levelResult, (.results | to_entries[] | .value[] | select(.criterionId == "<changed check>"))' "$EVIDENCE/scan.json"` shows the changed check with the result you intended.
- `scan.md` has the same level and failing checks as `scan.txt`.

For a changed check, also scan a repository where it should fail and one where it should pass, and save both results.
