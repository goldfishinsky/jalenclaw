import { describe, it, expect } from "vitest";
import {
  DEFAULT_PERMISSIONS,
  isCommandAllowed,
  isPathAllowed,
  type AgentPermissions,
} from "../../../src/agent/permissions.js";

describe("permissions", () => {
  describe("DEFAULT_PERMISSIONS", () => {
    it("has expected values", () => {
      expect(DEFAULT_PERMISSIONS.allowedCommands).toEqual(["ls", "cat", "node"]);
      expect(DEFAULT_PERMISSIONS.blockedPaths).toEqual(["/etc", "/usr", "~/.ssh"]);
      expect(DEFAULT_PERMISSIONS.networkAccess).toBe(false);
      expect(DEFAULT_PERMISSIONS.maxExecutionTime).toBe(30);
      expect(DEFAULT_PERMISSIONS.maxMemory).toBe(256);
    });
  });

  describe("isCommandAllowed", () => {
    it("returns true for allowed commands", () => {
      expect(isCommandAllowed("ls", DEFAULT_PERMISSIONS)).toBe(true);
      expect(isCommandAllowed("cat /tmp/file.txt", DEFAULT_PERMISSIONS)).toBe(true);
      expect(isCommandAllowed("node script.js", DEFAULT_PERMISSIONS)).toBe(true);
    });

    it("returns false for blocked commands", () => {
      expect(isCommandAllowed("rm -rf /", DEFAULT_PERMISSIONS)).toBe(false);
      expect(isCommandAllowed("curl http://evil.com", DEFAULT_PERMISSIONS)).toBe(false);
      expect(isCommandAllowed("sudo ls", DEFAULT_PERMISSIONS)).toBe(false);
    });

    it("returns false for empty command", () => {
      expect(isCommandAllowed("", DEFAULT_PERMISSIONS)).toBe(false);
      expect(isCommandAllowed("   ", DEFAULT_PERMISSIONS)).toBe(false);
    });

    it("handles custom permissions", () => {
      const custom: AgentPermissions = {
        ...DEFAULT_PERMISSIONS,
        allowedCommands: ["git", "npm"],
      };
      expect(isCommandAllowed("git status", custom)).toBe(true);
      expect(isCommandAllowed("ls", custom)).toBe(false);
    });
  });

  describe("isPathAllowed", () => {
    it("returns true for safe paths", () => {
      expect(isPathAllowed("/tmp/workspace", DEFAULT_PERMISSIONS)).toBe(true);
      expect(isPathAllowed("/home/user/project", DEFAULT_PERMISSIONS)).toBe(true);
      expect(isPathAllowed("/var/log/app.log", DEFAULT_PERMISSIONS)).toBe(true);
    });

    it("returns false for blocked paths", () => {
      expect(isPathAllowed("/etc/passwd", DEFAULT_PERMISSIONS)).toBe(false);
      expect(isPathAllowed("/usr/bin/node", DEFAULT_PERMISSIONS)).toBe(false);
      expect(isPathAllowed("~/.ssh/id_rsa", DEFAULT_PERMISSIONS)).toBe(false);
    });

    it("returns false for exact blocked path", () => {
      expect(isPathAllowed("/etc", DEFAULT_PERMISSIONS)).toBe(false);
      expect(isPathAllowed("/usr", DEFAULT_PERMISSIONS)).toBe(false);
    });

    it("returns false for empty path", () => {
      expect(isPathAllowed("", DEFAULT_PERMISSIONS)).toBe(false);
      expect(isPathAllowed("   ", DEFAULT_PERMISSIONS)).toBe(false);
    });

    it("does not block paths that merely start with the same prefix", () => {
      // "/etcetera" should NOT be blocked by "/etc"
      expect(isPathAllowed("/etcetera", DEFAULT_PERMISSIONS)).toBe(true);
      expect(isPathAllowed("/usrlocal", DEFAULT_PERMISSIONS)).toBe(true);
    });
  });
});
