import { describe, test, expect, afterEach } from "bun:test";
import { createLLMClient, DEFAULT_MODEL } from "../../src/engine/llm-client.js";

interface CapturedRequest {
  url: string;
  headers: Record<string, string>;
  body: { model: string; messages: unknown[] };
}

const originalFetch = globalThis.fetch;

describe("createLLMClient", () => {
  let captured: CapturedRequest | undefined;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    captured = undefined;
  });

  function mockFetch(content: string): void {
    globalThis.fetch = (async (url: string | URL, init?: RequestInit) => {
      const headers: Record<string, string> = {};
      for (const [key, value] of Object.entries(
        (init?.headers ?? {}) as Record<string, string>,
      )) {
        headers[key.toLowerCase()] = value;
      }
      captured = {
        url: url.toString(),
        headers,
        body: JSON.parse(String(init?.body)),
      };
      return new Response(
        JSON.stringify({
          choices: [{ message: { content: JSON.stringify(JSON.parse(content)) } }],
        }),
        { status: 200 },
      );
    }) as typeof fetch;
  }

  test("sends default model when none is configured", async () => {
    mockFetch(
      JSON.stringify({ pass: true, message: "ok", details: "details" }),
    );
    const client = createLLMClient({ apiKey: "test-key" });
    await client.evaluate("criterion", "context");

    expect(captured?.body.model).toBe(DEFAULT_MODEL);
  });

  test("sends configured model in request body", async () => {
    mockFetch(
      JSON.stringify({ pass: true, message: "ok", details: "details" }),
    );
    const client = createLLMClient({
      apiKey: "test-key",
      model: "deepseek-v4.1-flash",
      apiBaseUrl: "https://example.com/v1",
    });
    await client.evaluate("criterion", "context");

    expect(captured?.body.model).toBe("deepseek-v4.1-flash");
    expect(captured?.url).toBe("https://example.com/v1/chat/completions");
    expect(captured?.headers["authorization"]).toBe("Bearer test-key");
  });

  test("respects empty-string model as absent, falling back to default", async () => {
    mockFetch(
      JSON.stringify({ pass: true, message: "ok", details: "details" }),
    );
    const client = createLLMClient({ apiKey: "test-key", model: "" });
    await client.evaluate("criterion", "context");

    expect(captured?.body.model).toBe(DEFAULT_MODEL);
  });

  test("returns parsed pass/message/details from response", async () => {
    mockFetch(
      JSON.stringify({ pass: false, message: "not good", details: "why" }),
    );
    const client = createLLMClient({ apiKey: "test-key" });
    const result = await client.evaluate("criterion", "context");

    expect(result).toEqual({ pass: false, message: "not good", details: "why" });
  });
});

describe("createClaudeCliClient", () => {
  test("reads the structured output of claude -p", async () => {
    const { createClaudeCliClient } = await import("../../src/engine/llm-client.js");
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const bin = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "fake-claude-")), "claude");
    await fs.writeFile(bin, '#!/bin/sh\ncat >/dev/null\necho \'{"is_error":false,"structured_output":{"pass":true,"message":"ok"}}\'\n', { mode: 0o755 });
    expect(await createClaudeCliClient({ bin }).evaluate("p", "c")).toEqual({ pass: true, message: "ok" });
  });

  test("reports a CLI error as a failed evaluation", async () => {
    const { createClaudeCliClient } = await import("../../src/engine/llm-client.js");
    const fs = await import("node:fs/promises");
    const os = await import("node:os");
    const path = await import("node:path");
    const bin = path.join(await fs.mkdtemp(path.join(os.tmpdir(), "fake-claude-")), "claude");
    await fs.writeFile(bin, '#!/bin/sh\ncat >/dev/null\necho \'{"is_error":true,"result":"Not logged in"}\'\n', { mode: 0o755 });
    const r = await createClaudeCliClient({ bin }).evaluate("p", "c");
    expect(r.pass).toBe(false);
    expect(r.message).toContain("Not logged in");
  });
});
