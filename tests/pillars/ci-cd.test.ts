import { describe, test, expect, afterEach } from "bun:test";
import ciCd from "../../src/pillars/ci-cd.js";
import {
  createTestDir,
  cleanup,
  writeFixtures,
  mockProjectInfo,
  getCheck,
} from "../helpers.js";

let dirs: string[] = [];

async function make(name: string, fixtures: Record<string, string> = {}) {
  const dir = await createTestDir(name);
  dirs.push(dir);
  if (Object.keys(fixtures).length > 0) {
    await writeFixtures(dir, fixtures);
  }
  return dir;
}

afterEach(async () => {
  for (const d of dirs) await cleanup(d);
  dirs = [];
});

const ciRunsTestsCheck = getCheck(ciCd, "ci-runs-tests");
const ciRunsLintersCheck = getCheck(ciCd, "ci-runs-linters");
const buildAutomatedCheck = getCheck(ciCd, "build-automated");

// ---------------------------------------------------------------------------
// ci-runs-tests
// ---------------------------------------------------------------------------
describe("ci-runs-tests", () => {
  test("csharp: dotnet test", async () => {
    const dir = await make("cs-ci-test", {
      ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: dotnet test",
    });
    const r = await ciRunsTestsCheck(dir, mockProjectInfo({ detectedTypes: ["csharp"] }));
    expect(r.pass).toBe(true);
  });

  test("ruby: bundle exec rspec", async () => {
    const dir = await make("rb-ci-test", {
      ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: bundle exec rspec",
    });
    const r = await ciRunsTestsCheck(dir, mockProjectInfo({ detectedTypes: ["ruby"] }));
    expect(r.pass).toBe(true);
  });

  test("php: phpunit", async () => {
    const dir = await make("php-ci-test", {
      ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: phpunit",
    });
    const r = await ciRunsTestsCheck(dir, mockProjectInfo({ detectedTypes: ["php"] }));
    expect(r.pass).toBe(true);
  });

  test("swift: swift test", async () => {
    const dir = await make("swift-ci-test", {
      ".github/workflows/ci.yml": "jobs:\n  test:\n    steps:\n      - run: swift test",
    });
    const r = await ciRunsTestsCheck(dir, mockProjectInfo({ detectedTypes: ["swift"] }));
    expect(r.pass).toBe(true);
  });

  test("no CI fails", async () => {
    const dir = await make("ci-test-empty");
    const r = await ciRunsTestsCheck(dir, mockProjectInfo());
    expect(r.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// ci-runs-linters
// ---------------------------------------------------------------------------
describe("ci-runs-linters", () => {
  test("csharp: dotnet format", async () => {
    const dir = await make("cs-ci-lint", {
      ".github/workflows/ci.yml": "jobs:\n  lint:\n    steps:\n      - run: dotnet format --verify-no-changes",
    });
    const r = await ciRunsLintersCheck(dir, mockProjectInfo({ detectedTypes: ["csharp"] }));
    expect(r.pass).toBe(true);
  });

  test("ruby: rubocop", async () => {
    const dir = await make("rb-ci-lint", {
      ".github/workflows/ci.yml": "jobs:\n  lint:\n    steps:\n      - run: rubocop",
    });
    const r = await ciRunsLintersCheck(dir, mockProjectInfo({ detectedTypes: ["ruby"] }));
    expect(r.pass).toBe(true);
  });

  test("php: phpstan", async () => {
    const dir = await make("php-ci-lint", {
      ".github/workflows/ci.yml": "jobs:\n  lint:\n    steps:\n      - run: phpstan analyse",
    });
    const r = await ciRunsLintersCheck(dir, mockProjectInfo({ detectedTypes: ["php"] }));
    expect(r.pass).toBe(true);
  });

  test("swift: swiftlint", async () => {
    const dir = await make("swift-ci-lint", {
      ".github/workflows/ci.yml": "jobs:\n  lint:\n    steps:\n      - run: swiftlint lint",
    });
    const r = await ciRunsLintersCheck(dir, mockProjectInfo({ detectedTypes: ["swift"] }));
    expect(r.pass).toBe(true);
  });

  test("js: oxlint", async () => {
    const dir = await make("js-ci-oxlint", {
      ".github/workflows/ci.yml": "jobs:\n  lint:\n    steps:\n      - run: oxlint src/",
    });
    const r = await ciRunsLintersCheck(dir, mockProjectInfo({ detectedTypes: ["node"] }));
    expect(r.pass).toBe(true);
  });

  test("js: oxfmt --check", async () => {
    const dir = await make("js-ci-oxfmt", {
      ".github/workflows/ci.yml": "jobs:\n  lint:\n    steps:\n      - run: oxfmt --check src/",
    });
    const r = await ciRunsLintersCheck(dir, mockProjectInfo({ detectedTypes: ["node"] }));
    expect(r.pass).toBe(true);
  });

  test("no CI fails", async () => {
    const dir = await make("ci-lint-empty");
    const r = await ciRunsLintersCheck(dir, mockProjectInfo());
    expect(r.pass).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// build-automated
// ---------------------------------------------------------------------------
describe("build-automated", () => {
  test("csharp: dotnet build in CI", async () => {
    const dir = await make("cs-ci-build", {
      ".github/workflows/ci.yml": "jobs:\n  build:\n    steps:\n      - run: dotnet build",
    });
    const r = await buildAutomatedCheck(dir, mockProjectInfo({ detectedTypes: ["csharp"] }));
    expect(r.pass).toBe(true);
  });

  test("swift: swift build in CI", async () => {
    const dir = await make("swift-ci-build", {
      ".github/workflows/ci.yml": "jobs:\n  build:\n    steps:\n      - run: swift build",
    });
    const r = await buildAutomatedCheck(dir, mockProjectInfo({ detectedTypes: ["swift"] }));
    expect(r.pass).toBe(true);
  });

  test("swift: xcodebuild in CI", async () => {
    const dir = await make("swift-ci-xcode", {
      ".github/workflows/ci.yml": "jobs:\n  build:\n    steps:\n      - run: xcodebuild -scheme MyApp",
    });
    const r = await buildAutomatedCheck(dir, mockProjectInfo({ detectedTypes: ["swift"] }));
    expect(r.pass).toBe(true);
  });

  test("no build step fails", async () => {
    const dir = await make("build-empty");
    const r = await buildAutomatedCheck(dir, mockProjectInfo());
    expect(r.pass).toBe(false);
  });
});

describe("CI command variants", () => {
  test("pnpm run test counts as running tests", async () => {
    const dir = await make("ci-pnpm-run", { ".github/workflows/ci.yml": "steps:\n  - run: pnpm run test\n" });
    expect((await ciRunsTestsCheck(dir, mockProjectInfo())).pass).toBe(true);
  });

  test("biome ci and go vet count as linting", async () => {
    const biome = await make("ci-biome", { ".github/workflows/ci.yml": "steps:\n  - run: pnpm biome ci .\n" });
    expect((await ciRunsLintersCheck(biome, mockProjectInfo())).pass).toBe(true);
    const vet = await make("ci-vet", { ".github/workflows/ci.yml": "steps:\n  - run: go vet ./...\n" });
    expect((await ciRunsLintersCheck(vet, mockProjectInfo())).pass).toBe(true);
  });
});

describe("deploy-pipeline for infra and GitOps repos", () => {
  const deployCheck = getCheck(ciCd, "deploy-pipeline");

  test("tofu apply in CI", async () => {
    const dir = await make("deploy-tofu", { ".github/workflows/infra.yml": "steps:\n  - run: tofu apply plan.tfplan\n" });
    expect((await deployCheck(dir, mockProjectInfo())).pass).toBe(true);
  });

  test("an Argo CD application manifest", async () => {
    const dir = await make("deploy-argo", {
      "platform/apps/app.yaml": "apiVersion: argoproj.io/v1alpha1\nkind: Application\nmetadata:\n  name: web\n",
    });
    expect((await deployCheck(dir, mockProjectInfo())).pass).toBe(true);
  });
});
