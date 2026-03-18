// tests/unit/skills/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  loadSkillMetadata,
  discoverSkills,
} from "../../../src/skills/loader.js";

describe("loadSkillMetadata", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jalenclaw-skill-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("parses valid SKILL.md with full metadata", async () => {
    const skillDir = path.join(tmpDir, "web-search");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: web-search
description: Search the web
triggers: ["search", "find", "look up"]
requiredPermissions: ["network"]
---
Instructions for the skill...
`,
    );

    const metadata = await loadSkillMetadata(skillDir);
    expect(metadata).not.toBeNull();
    expect(metadata!.name).toBe("web-search");
    expect(metadata!.description).toBe("Search the web");
    expect(metadata!.triggers).toEqual(["search", "find", "look up"]);
    expect(metadata!.requiredPermissions).toEqual(["network"]);
    expect(metadata!.handlerPath).toBeUndefined();
  });

  it("returns null for missing SKILL.md", async () => {
    const skillDir = path.join(tmpDir, "no-skill");
    await fs.mkdir(skillDir, { recursive: true });

    const metadata = await loadSkillMetadata(skillDir);
    expect(metadata).toBeNull();
  });

  it("returns null for SKILL.md without frontmatter", async () => {
    const skillDir = path.join(tmpDir, "bad-skill");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      "Just some text, no frontmatter.",
    );

    const metadata = await loadSkillMetadata(skillDir);
    expect(metadata).toBeNull();
  });

  it("detects handler.ts presence and sets handlerPath", async () => {
    const skillDir = path.join(tmpDir, "with-handler");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: calculator
description: Do math
triggers: ["calc", "calculate"]
requiredPermissions: []
---
`,
    );
    await fs.writeFile(
      path.join(skillDir, "handler.ts"),
      "export default {};",
    );

    const metadata = await loadSkillMetadata(skillDir);
    expect(metadata).not.toBeNull();
    expect(metadata!.handlerPath).toBe(path.join(skillDir, "handler.ts"));
  });

  it("defaults triggers and requiredPermissions to empty arrays when omitted", async () => {
    const skillDir = path.join(tmpDir, "minimal");
    await fs.mkdir(skillDir, { recursive: true });
    await fs.writeFile(
      path.join(skillDir, "SKILL.md"),
      `---
name: minimal-skill
description: A minimal skill
---
`,
    );

    const metadata = await loadSkillMetadata(skillDir);
    expect(metadata).not.toBeNull();
    expect(metadata!.triggers).toEqual([]);
    expect(metadata!.requiredPermissions).toEqual([]);
  });
});

describe("discoverSkills", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jalenclaw-discover-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it("discovers skills from multiple directories", async () => {
    const dir1 = path.join(tmpDir, "dir1");
    const dir2 = path.join(tmpDir, "dir2");
    const skill1 = path.join(dir1, "alpha");
    const skill2 = path.join(dir2, "beta");
    await fs.mkdir(skill1, { recursive: true });
    await fs.mkdir(skill2, { recursive: true });

    await fs.writeFile(
      path.join(skill1, "SKILL.md"),
      `---
name: alpha
description: Alpha skill
triggers: ["a"]
requiredPermissions: []
---
`,
    );
    await fs.writeFile(
      path.join(skill2, "SKILL.md"),
      `---
name: beta
description: Beta skill
triggers: ["b"]
requiredPermissions: []
---
`,
    );

    const skills = await discoverSkills([dir1, dir2]);
    expect(skills).toHaveLength(2);
    expect(skills.map((s) => s.name).sort()).toEqual(["alpha", "beta"]);
  });

  it("handles empty directories gracefully", async () => {
    const emptyDir = path.join(tmpDir, "empty");
    await fs.mkdir(emptyDir, { recursive: true });

    const skills = await discoverSkills([emptyDir]);
    expect(skills).toEqual([]);
  });

  it("skips nonexistent directories", async () => {
    const skills = await discoverSkills([
      path.join(tmpDir, "does-not-exist"),
    ]);
    expect(skills).toEqual([]);
  });
});
