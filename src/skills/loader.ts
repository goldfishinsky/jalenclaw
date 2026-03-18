// src/skills/loader.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import type { SkillMetadata } from "./interface.js";

/**
 * Parse SKILL.md frontmatter (YAML-like key: value pairs between --- delimiters).
 * Returns null if the content has no valid frontmatter.
 */
function parseFrontmatter(
  content: string,
): Record<string, string> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;

  const block = match[1];
  const result: Record<string, string> = {};

  for (const line of block.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    const value = line.slice(colonIdx + 1).trim();
    if (key) result[key] = value;
  }

  return result;
}

/**
 * Parse a JSON array string like `["a", "b"]` into a string array.
 * Returns an empty array if parsing fails.
 */
function parseStringArray(raw: string): string[] {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (Array.isArray(parsed) && parsed.every((v) => typeof v === "string")) {
      return parsed as string[];
    }
    return [];
  } catch {
    return [];
  }
}

/**
 * Check whether a file exists at the given path.
 */
async function fileExists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Load skill metadata from a single skill directory.
 * Expects a SKILL.md file with frontmatter. Optionally detects handler.ts.
 * Returns null if SKILL.md is missing or has no valid frontmatter.
 */
export async function loadSkillMetadata(
  skillDir: string,
): Promise<SkillMetadata | null> {
  const skillMdPath = path.join(skillDir, "SKILL.md");

  let content: string;
  try {
    content = await fs.readFile(skillMdPath, "utf-8");
  } catch {
    return null;
  }

  const frontmatter = parseFrontmatter(content);
  if (!frontmatter) return null;

  const name = frontmatter["name"];
  const description = frontmatter["description"];
  if (!name || !description) return null;

  const triggers = parseStringArray(frontmatter["triggers"] ?? "[]");
  const requiredPermissions = parseStringArray(
    frontmatter["requiredPermissions"] ?? "[]",
  );

  const handlerTsPath = path.join(skillDir, "handler.ts");
  const hasHandler = await fileExists(handlerTsPath);

  return {
    name,
    description,
    triggers,
    requiredPermissions,
    handlerPath: hasHandler ? handlerTsPath : undefined,
  };
}

/**
 * Discover all skills in the given directories.
 * Each directory is expected to contain subdirectories, each of which may
 * contain a SKILL.md file.
 */
export async function discoverSkills(
  directories: string[],
): Promise<SkillMetadata[]> {
  const skills: SkillMetadata[] = [];

  for (const dir of directories) {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await fs.readdir(dir, { withFileTypes: true });
    } catch {
      continue; // skip missing directories
    }

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const skillDir = path.join(dir, entry.name);
      const metadata = await loadSkillMetadata(skillDir);
      if (metadata) {
        skills.push(metadata);
      }
    }
  }

  return skills;
}
