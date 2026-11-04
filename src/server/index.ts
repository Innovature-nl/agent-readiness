import path from "node:path";
import fs from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { exec } from "node:child_process";
import type { SerializedReportData } from "../engine/serializer.js";
import type { OrgSummary } from "../engine/history.js";
import type { ScanService } from "./scanner.js";

function getCurrentDir(): string {
  // Bun provides import.meta.dir, Node uses import.meta.dirname (21+) or fileURLToPath
  if (typeof import.meta.dir === "string") return import.meta.dir;
  if (typeof import.meta.dirname === "string") return import.meta.dirname;
  return path.dirname(fileURLToPath(import.meta.url));
}

function findWebDir(): string {
  const currentDir = getCurrentDir();
  // When bundled: currentDir = .../dist/, web is at dist/web
  const bundled = path.resolve(currentDir, "web");
  // When running from source: currentDir = .../src/server/, web is at ../../dist/web
  const source = path.resolve(currentDir, "../../dist/web");

  if (fs.existsSync(bundled)) return bundled;
  if (fs.existsSync(source)) return source;
  return bundled; // fallback for error message
}

const DIST_WEB_DIR = findWebDir();

const MIME_TYPES: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  return MIME_TYPES[ext] ?? "application/octet-stream";
}

type Payload = SerializedReportData | OrgSummary;

/**
 * Starts an HTTP server that serves the pre-built SPA
 * with the report JSON injected into the HTML.
 *
 * `reportData` can be a loader; it then runs on every page load, so a refresh shows new scans.
 * index.html is read per request too, so a rebuilt dashboard needs no restart.
 * Port 0 picks a free port.
 */
export async function startServer(
  reportData: Payload | (() => Promise<Payload>),
  globalName: "__AGENT_READINESS_REPORT__" | "__AGENT_READINESS_ORG__" = "__AGENT_READINESS_REPORT__",
  port = 0,
  scanner?: ScanService,
): Promise<{
  server: http.Server;
  url: string;
}> {
  const indexPath = path.join(DIST_WEB_DIR, "index.html");

  if (!fs.existsSync(indexPath)) {
    throw new Error(
      `Web dashboard not built. Run "bun run build:web" first.\n` +
        `Expected files at: ${DIST_WEB_DIR}`,
    );
  }

  const renderIndex = async () => {
    const data = typeof reportData === "function" ? await reportData() : reportData;
    return fs
      .readFileSync(indexPath, "utf-8")
      .replace("</head>", `<script>window.${globalName} = ${JSON.stringify(data)};</script>\n</head>`);
  };

  const sendIndex = async (res: http.ServerResponse) => {
    try {
      const html = await renderIndex();
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
      res.end(html);
    } catch (err) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`Failed to load the dashboard: ${err instanceof Error ? err.message : String(err)}`);
    }
  };

  const sendJson = (res: http.ServerResponse, code: number, body: unknown) => {
    res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
    res.end(JSON.stringify(body));
  };

  const handleApi = async (req: http.IncomingMessage, res: http.ServerResponse, pathname: string) => {
    if (pathname === "/api/summary" && req.method === "GET") {
      return sendJson(res, 200, typeof reportData === "function" ? await reportData() : reportData);
    }
    if (!scanner) return sendJson(res, 404, { error: "Start the dashboard with --github-org to scan from it." });
    if (pathname === "/api/github/repos" && req.method === "GET") {
      return sendJson(res, 200, { org: scanner.org, repos: await scanner.listRepos() });
    }
    if (pathname === "/api/scan" && req.method === "GET") return sendJson(res, 200, scanner.status());
    if (pathname === "/api/scan" && req.method === "POST") {
      // A JSON content type forces a CORS preflight, which this server never answers, so other sites cannot trigger scans.
      if (!req.headers["content-type"]?.startsWith("application/json")) return sendJson(res, 415, { error: "Expected JSON" });
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        if (body.length > 100_000) return sendJson(res, 413, { error: "Too large" });
      }
      const repos = (JSON.parse(body || "{}") as { repos?: unknown }).repos;
      if (!Array.isArray(repos) || !repos.every((r) => typeof r === "string")) return sendJson(res, 400, { error: "repos must be a list of names" });
      return sendJson(res, 202, await scanner.start(repos));
    }
    return sendJson(res, 404, { error: "Not found" });
  };

  const server = http.createServer((req, res) => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
    const pathname = url.pathname;

    if (pathname.startsWith("/api/")) {
      handleApi(req, res, pathname).catch((err) => sendJson(res, 500, { error: err instanceof Error ? err.message : String(err) }));
      return;
    }

    // Serve injected index.html for root and SPA fallback
    if (pathname === "/" || pathname === "/index.html") {
      void sendIndex(res);
      return;
    }

    // Try to serve static file from dist/web
    const filePath = path.join(DIST_WEB_DIR, pathname);

    // Prevent directory traversal
    if (!filePath.startsWith(DIST_WEB_DIR)) {
      res.writeHead(403);
      res.end("Forbidden");
      return;
    }

    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const content = fs.readFileSync(filePath);
      res.writeHead(200, { "Content-Type": getMimeType(filePath) });
      res.end(content);
      return;
    }

    // SPA fallback: serve injected index.html for unknown routes
    void sendIndex(res);
  });

  return new Promise((resolve, reject) => {
    server.once("error", reject);
    // Loopback only: the scan endpoints run git and gh with the user's credentials.
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const actual = typeof addr === "object" && addr ? addr.port : 0;
      resolve({ server, url: `http://localhost:${actual}` });
    });
  });
}

/**
 * Opens the given URL in the default browser.
 */
export async function openBrowser(url: string): Promise<void> {
  const cmd =
    process.platform === "darwin"
      ? `open "${url}"`
      : process.platform === "win32"
        ? `start "" "${url}"`
        : `xdg-open "${url}"`;

  return new Promise((resolve) => {
    exec(cmd, () => resolve());
  });
}
