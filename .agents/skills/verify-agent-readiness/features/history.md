# History

```sh
H=$(mktemp -d)
bun src/index.ts . --no-web --history "$H" > /dev/null
bun src/index.ts . --no-web --no-color --history "$H" > "$EVIDENCE/history.txt"
bun src/index.ts org "$H" --format json > "$EVIDENCE/org.json"
```

Expect:

- Two snapshots in `$H/<checkout directory name>/`.
- `history.txt` ends with a line that compares with the previous scan (`Since ...`).
- `org.json` lists this repository with its level.
