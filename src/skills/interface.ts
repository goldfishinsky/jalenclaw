/**
 * Skill system types and interfaces.
 * Skills are discoverable capabilities loaded from SKILL.md files.
 */

export interface SkillContext {
  message: string;
  groupId: string;
  senderId: string;
}

export interface Skill {
  name: string;
  description: string;
  triggers: string[];
  requiredPermissions: string[];
  execute(context: SkillContext): AsyncIterable<string>;
}

export interface SkillMetadata {
  name: string;
  description: string;
  triggers: string[];
  requiredPermissions: string[];
  handlerPath?: string; // path to handler.ts, undefined for prompt-only skills
}
