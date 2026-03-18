// tests/unit/auth/token-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { createTempDir } from "../../helpers/index.js";
import {
  readTokens,
  writeTokens,
  deleteTokens,
  type OAuthCredentials,
} from "../../../src/auth/token-store.js";

describe("token-store", () => {
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
    accessToken: "sk-ant-oat01-test-access-token",
    refreshToken: "sk-ant-ort01-test-refresh-token",
    expiresAt: Date.now() + 3600_000,
    scopes: ["user:inference", "user:profile"],
  };

  describe("writeTokens", () => {
    it("writes tokens to file", async () => {
      await writeTokens(tokenPath, validTokens);
      const result = await readTokens(tokenPath);
      expect(result).toEqual(validTokens);
    });

    it("sets file permissions to 0600", async () => {
      await writeTokens(tokenPath, validTokens);
      const stats = await stat(tokenPath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it("creates parent directories if they don't exist", async () => {
      const nestedPath = join(tempDir, "nested", "dir", "tokens.json");
      await writeTokens(nestedPath, validTokens);
      const result = await readTokens(nestedPath);
      expect(result).toEqual(validTokens);
    });
  });

  describe("readTokens", () => {
    it("returns null when file does not exist", async () => {
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });

    it("returns null when file contains invalid JSON", async () => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(tokenPath, "not json");
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });

    it("returns null when JSON is missing required fields", async () => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(tokenPath, JSON.stringify({ version: 1 }));
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });
  });

  describe("deleteTokens", () => {
    it("deletes existing token file", async () => {
      await writeTokens(tokenPath, validTokens);
      await deleteTokens(tokenPath);
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });

    it("does not throw when file does not exist", async () => {
      await expect(deleteTokens(tokenPath)).resolves.toBeUndefined();
    });
  });
});
