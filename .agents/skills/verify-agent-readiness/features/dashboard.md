# Dashboard

Run `features/history.md` first; the dashboard reads its history directory `$H`.

```sh
bun src/index.ts org "$H" --port 4848 > "$EVIDENCE/server.txt" 2>&1 &
SERVER=$!
sleep 3
curl -s http://127.0.0.1:4848/api/summary > "$EVIDENCE/summary.json"
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:4848/api/report.md > "$EVIDENCE/report-md.txt"
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://127.0.0.1:4848/api/scan -d '{}' > "$EVIDENCE/scan-post.txt"
kill $SERVER
```

Expect:

- `summary.json` has `orgLevel` and lists this repository with the same level as `org.json`.
- `report-md.txt` is `404`: Markdown exists only for a single-repository report.
- `scan-post.txt` is `415` (wrong content type) or `404` (no `--github-org`), never `202`.

For a change in `web/`, open http://127.0.0.1:4848 in a browser, take a screenshot of the part you changed and add it to the PR.
