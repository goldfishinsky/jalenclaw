// src/skills/registry.ts
import type { SkillMetadata } from "./interface.js";

export interface SkillRegistry {
  register(metadata: SkillMetadata): void;
  findByTrigger(message: string): SkillMetadata | undefined;
  getAll(): SkillMetadata[];
}

/**
 * Create a skill registry that stores skills and matches them by trigger keywords.
 * findByTrigger performs case-insensitive word matching against trigger keywords.
 */
export function createSkillRegistry(): SkillRegistry {
  const skills: SkillMetadata[] = [];

  return {
    register(metadata: SkillMetadata): void {
      skills.push(metadata);
    },

    findByTrigger(message: string): SkillMetadata | undefined {
      const lower = message.toLowerCase();
      return skills.find((skill) =>
        skill.triggers.some((trigger) => lower.includes(trigger.toLowerCase())),
      );
    },

    getAll(): SkillMetadata[] {
      return [...skills];
    },
  };
}
