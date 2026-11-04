import { describe, test, expect, afterEach } from "bun:test";
import documentation from "../../src/pillars/documentation.js";
import { createTestDir, cleanup, writeFixtures, mockProjectInfo, getCheck } from "../helpers.js";

let dirs: string[] = [];
afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

async function make(name: string, fixtures: Record<string, string>) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  await writeFixtures(dir, fixtures);
  return dir;
}

const apiDocs = getCheck(documentation, "api-docs");

describe("api-docs", () => {
  test("finds proto contracts in a monorepo", async () => {
    const dir = await make("api-proto", { "proto/src/acme/order/v1/order.proto": 'syntax = "proto3";' });
    expect((await apiDocs(dir, mockProjectInfo())).pass).toBe(true);
  });

  test("finds an OpenAPI spec per service", async () => {
    const dir = await make("api-openapi", { "services/gateway/openapi.yaml": "openapi: 3.1.0" });
    expect((await apiDocs(dir, mockProjectInfo())).pass).toBe(true);
  });

  test("ignores specs inside node_modules", async () => {
    const dir = await make("api-none", { "node_modules/pkg/openapi.json": "{}" });
    expect((await apiDocs(dir, mockProjectInfo())).pass).toBe(false);
  });
});

describe("architecture-docs", () => {
  const archDocs = getCheck(documentation, "architecture-docs");

  test("accepts ADRs in docs/decisions", async () => {
    const dir = await make("arch-decisions", { "docs/decisions/001-message-broker.md": "# ADR" });
    expect((await archDocs(dir, mockProjectInfo())).pass).toBe(true);
  });

  test("accepts an architecture page deeper in docs", async () => {
    const dir = await make("arch-guidelines", { "docs/guidelines/architecture.md": "# Architecture" });
    expect((await archDocs(dir, mockProjectInfo())).pass).toBe(true);
  });

  test("fails without any", async () => {
    const dir = await make("arch-none", { "docs/setup.md": "# Setup" });
    expect((await archDocs(dir, mockProjectInfo())).pass).toBe(false);
  });
});

describe("architecture-docs in an agent-docs folder", () => {
  test("accepts agent-docs/widgets-architecture.md", async () => {
    const dir = await make("arch-agent-docs", { "agent-docs/widgets-architecture.md": "# Architecture" });
    expect((await getCheck(documentation, "architecture-docs")(dir, mockProjectInfo())).pass).toBe(true);
  });
});
