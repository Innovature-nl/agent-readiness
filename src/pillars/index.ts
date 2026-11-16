import type { Pillar } from "../types/index.js";
import ciCd from "./ci-cd.js";
import codeHealth from "./code-health.js";
import devEnvironment from "./dev-environment.js";
import documentation from "./documentation.js";
import security from "./security.js";
import styleLinting from "./style-linting.js";
import testing from "./testing.js";

export const ALL_PILLARS: Pillar[] = [styleLinting, testing, documentation, devEnvironment, ciCd, codeHealth, security];
