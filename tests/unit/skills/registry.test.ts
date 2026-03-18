// tests/unit/skills/registry.test.ts
import { describe, it, expect } from "vitest";
import { createSkillRegistry } from "../../../src/skills/registry.js";
import type { SkillMetadata } from "../../../src/skills/interface.js";

function makeSkill(overrides: Partial<SkillMetadata> = {}): SkillMetadata {
  return {
    name: "test-skill",
    description: "A test skill",
    triggers: ["test"],
    requiredPermissions: [],
    ...overrides,
  };
}

describe("createSkillRegistry", () => {
  it("registers a skill and retrieves it via getAll", () => {
    const registry = createSkillRegistry();
    const skill = makeSkill({ name: "my-skill" });

    registry.register(skill);

    const all = registry.getAll();
    expect(all).toHaveLength(1);
    expect(all[0].name).toBe("my-skill");
  });

  it("finds a skill by trigger keyword in message", () => {
    const registry = createSkillRegistry();
    registry.register(
      makeSkill({ name: "search", triggers: ["search", "find"] }),
    );

    const found = registry.findByTrigger("Can you search for something?");
    expect(found).toBeDefined();
    expect(found!.name).toBe("search");
  });

  it("returns undefined when no trigger matches", () => {
    const registry = createSkillRegistry();
    registry.register(
      makeSkill({ name: "search", triggers: ["search", "find"] }),
    );

    const found = registry.findByTrigger("Hello world");
    expect(found).toBeUndefined();
  });

  it("matches triggers case-insensitively", () => {
    const registry = createSkillRegistry();
    registry.register(
      makeSkill({ name: "search", triggers: ["Search", "FIND"] }),
    );

    expect(registry.findByTrigger("please SEARCH this")).toBeDefined();
    expect(registry.findByTrigger("find me something")).toBeDefined();
    expect(registry.findByTrigger("FIND IT")).toBeDefined();
  });

  it("getAll returns all registered skills", () => {
    const registry = createSkillRegistry();
    registry.register(makeSkill({ name: "a" }));
    registry.register(makeSkill({ name: "b" }));
    registry.register(makeSkill({ name: "c" }));

    const all = registry.getAll();
    expect(all).toHaveLength(3);
    expect(all.map((s) => s.name).sort()).toEqual(["a", "b", "c"]);
  });

  it("getAll returns a copy, not the internal array", () => {
    const registry = createSkillRegistry();
    registry.register(makeSkill({ name: "x" }));

    const all = registry.getAll();
    all.push(makeSkill({ name: "injected" }));

    expect(registry.getAll()).toHaveLength(1);
  });

  it("returns the first matching skill when multiple skills match", () => {
    const registry = createSkillRegistry();
    registry.register(
      makeSkill({ name: "search", triggers: ["search"] }),
    );
    registry.register(
      makeSkill({ name: "lookup", triggers: ["search", "lookup"] }),
    );

    const found = registry.findByTrigger("search something");
    expect(found).toBeDefined();
    expect(found!.name).toBe("search");
  });
});
