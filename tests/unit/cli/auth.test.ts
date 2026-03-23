// tests/unit/cli/auth.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { writeFileSync } from "node:fs";
import { createTempDir } from "../../helpers/index.js";
import {
  readClaudeCliCredentials,
  loginFlow,
  logoutFlow,
  statusFlow,
  refreshFlow,
} from "../../../src/cli/auth.js";
import { readTokens, writeTokens, type OAuthCredentials } from "../../../src/auth/token-store.js";

describe("cli/auth", () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;
  let tokenPath: string;

  beforeEach(async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
    tokenPath = join(tempDir, "oauth-credentials.json");
  });

  afterEach(async () => {
    await cleanup();
  });

  const validTokens: OAuthCredentials = {
    version: 1,
    accessToken: "sk-ant-oat01-valid-token",
    refreshToken: "sk-ant-ort01-valid-refresh",
    expiresAt: Date.now() + 3600_000,
    scopes: ["user:inference", "user:profile"],
  };

  describe("readClaudeCliCredentials", () => {
    it("reads credentials from file", () => {
      const credPath = join(tempDir, ".credentials.json");
      writeFileSync(
        credPath,
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "sk-ant-oat01-test",
            refreshToken: "sk-ant-ort01-test",
            expiresAt: Date.now() + 3600_000,
          },
        }),
      );

      const result = readClaudeCliCredentials({ credentialsPath: credPath, skipKeychain: true });
      expect(result).not.toBeNull();
      expect(result!.accessToken).toBe("sk-ant-oat01-test");
      expect(result!.refreshToken).toBe("sk-ant-ort01-test");
    });

    it("returns null when file does not exist", () => {
      const result = readClaudeCliCredentials({
        credentialsPath: join(tempDir, "nonexistent.json"),
        skipKeychain: true,
      });
      expect(result).toBeNull();
    });

    it("returns null when credentials are invalid", () => {
      const credPath = join(tempDir, ".credentials.json");
      writeFileSync(credPath, JSON.stringify({ claudeAiOauth: { invalid: true } }));
      const result = readClaudeCliCredentials({ credentialsPath: credPath, skipKeychain: true });
      expect(result).toBeNull();
    });
  });

  describe("loginFlow", () => {
    it("imports credentials from Claude Code CLI", async () => {
      const credPath = join(tempDir, ".credentials.json");
      writeFileSync(
        credPath,
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "sk-ant-oat01-imported",
            refreshToken: "sk-ant-ort01-imported",
            expiresAt: Date.now() + 3600_000,
          },
        }),
      );

      const result = await loginFlow({ tokenPath, credentialsPath: credPath, skipKeychain: true });
      expect(result.success).toBe(true);
      expect(result.message).toContain("Successfully imported");

      const stored = await readTokens(tokenPath);
      expect(stored).not.toBeNull();
      expect(stored!.accessToken).toBe("sk-ant-oat01-imported");
    });

    it("returns error when no Claude Code credentials", async () => {
      const result = await loginFlow({
        tokenPath,
        credentialsPath: join(tempDir, "nonexistent.json"),
        skipKeychain: true,
      });
      expect(result.success).toBe(false);
      expect(result.message).toContain("No Claude Code credentials found");
    });
  });

  describe("logoutFlow", () => {
    it("deletes token file", async () => {
      await writeTokens(tokenPath, validTokens);
      const result = await logoutFlow({ tokenPath });
      expect(result.success).toBe(true);
      const stored = await readTokens(tokenPath);
      expect(stored).toBeNull();
    });
  });

  describe("statusFlow", () => {
    it("shows not authenticated when no tokens", async () => {
      const result = await statusFlow({ tokenPath });
      expect(result.authenticated).toBe(false);
    });

    it("shows authenticated when tokens exist", async () => {
      await writeTokens(tokenPath, validTokens);
      const result = await statusFlow({ tokenPath });
      expect(result.authenticated).toBe(true);
      expect(result.message).toContain("Authenticated");
    });

    it("shows expired when token is expired", async () => {
      const expired = { ...validTokens, expiresAt: Date.now() - 1000 };
      await writeTokens(tokenPath, expired);
      const result = await statusFlow({ tokenPath });
      expect(result.authenticated).toBe(true);
      expect(result.expired).toBe(true);
    });
  });

  describe("refreshFlow", () => {
    it("re-imports from Claude Code CLI", async () => {
      const credPath = join(tempDir, ".credentials.json");
      writeFileSync(
        credPath,
        JSON.stringify({
          claudeAiOauth: {
            accessToken: "sk-ant-oat01-refreshed",
            refreshToken: "sk-ant-ort01-refreshed",
            expiresAt: Date.now() + 7200_000,
          },
        }),
      );

      // Write old token first
      await writeTokens(tokenPath, validTokens);

      const result = await refreshFlow({ tokenPath });
      expect(result.success).toBe(true);
    });
  });
});
