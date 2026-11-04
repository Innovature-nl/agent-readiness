import type { Criterion, Pillar } from "../types/index.js";

export const PROFILES = ["default", "internal"] as const;
export type Profile = (typeof PROFILES)[number];

/** Checks that only matter for code shared outside the company. */
const INTERNAL_DROPPED = new Set(["license", "security-policy"]);

/** In internal repos these checks also pass when the alternative check passes. */
const INTERNAL_ALTERNATIVES: Record<string, { id: string; note: string }> = {
  contributing: { id: "ai-context", note: "An AGENTS.md or CLAUDE.md also counts." },
  editorconfig: { id: "formatter", note: "A configured formatter also counts." },
};

/**
 * The internal profile is meant for private company repositories: it drops checks that only
 * matter for open source and accepts the agent-oriented alternative for the others.
 */
export function applyProfile(pillars: Pillar[], profile: Profile): Pillar[] {
  if (profile === "default") return pillars;
  const byId = new Map(pillars.flatMap((p) => p.criteria).map((c) => [c.id, c]));

  return pillars.map((p) => ({
    ...p,
    criteria: p.criteria
      .filter((c) => !INTERNAL_DROPPED.has(c.id))
      .map((c): Criterion => {
        const alt = INTERNAL_ALTERNATIVES[c.id];
        const other = alt && byId.get(alt.id);
        if (!alt || !other) return c;
        return {
          ...c,
          profileNote: alt.note,
          check: async (repoPath, projectInfo, llmClient) => {
            const own = await c.check(repoPath, projectInfo, llmClient);
            if (own.pass) return own;
            const fallback = await other.check(repoPath, projectInfo, llmClient);
            return fallback.pass ? { ...fallback, criterionId: c.id } : own;
          },
        };
      }),
  }));
}

export function parseProfile(value: unknown): Profile {
  const profile = (value ?? "default") as Profile;
  if (!PROFILES.includes(profile)) {
    throw new Error(`Unknown profile "${String(value)}". Use one of: ${PROFILES.join(", ")}.`);
  }
  return profile;
}
