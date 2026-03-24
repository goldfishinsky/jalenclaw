// tests/integration/auth/oauth-flow.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { join } from "node:path";
import { createTempDir } from "../../helpers/index.js";
import { startCallbackServer } from "../../../src/auth/oauth-server.js";
import { generatePKCE } from "../../../src/auth/pkce.js";
import { writeTokens, type OAuthCredentials } from "../../../src/auth/token-store.js";
import { OAuthStrategy } from "../../../src/auth/oauth.js";
import { ApiKeyStrategy } from "../../../src/auth/apikey.js";

describe("OAuth flow integration", () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  it("callback server receives code, tokens can be stored and used", async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
    const tokenPath = join(tempDir, "oauth-credentials.json");

    // Step 1: Generate PKCE
    const pkce = generatePKCE();
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);

    // Step 2: Start callback server
    const server = await startCallbackServer({ timeoutMs: 5000 });
    expect(server.port).toBeGreaterThan(0);

    try {
      // Step 3: Simulate browser callback
      const codePromise = server.waitForCode();
      await fetch(
        `http://127.0.0.1:${server.port}/callback?code=integration-test-code`,
      );
      const { code } = await codePromise;
      expect(code).toBe("integration-test-code");

      // Step 4: Simulate token exchange result and store
      const tokens: OAuthCredentials = {
        version: 1,
        accessToken: "sk-ant-oat01-integration",
        refreshToken: "sk-ant-ort01-integration",
        expiresAt: Date.now() + 3600_000,
        scopes: ["user:inference", "user:profile"],
      };
      await writeTokens(tokenPath, tokens);

      // Step 5: Use OAuthStrategy to get headers
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://platform.claude.com/v1/oauth/token",
        clientId: "test",
      });
      const headers = await strategy.getHeaders();
      expect(headers["x-api-key"]).toBe("sk-ant-oat01-integration");
    } finally {
      vi.unstubAllGlobals();
      await server.close();
    }
  });

  it("AuthStrategy interface works with both implementations", async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;

    // API Key strategy
    const apiKeyStrategy = new ApiKeyStrategy("sk-ant-api03-test");
    expect(await apiKeyStrategy.getHeaders()).toEqual({
      "X-Api-Key": "sk-ant-api03-test",
    });
    expect(await apiKeyStrategy.isValid()).toBe(true);

    // OAuth strategy (with pre-written valid token)
    const tokenPath = join(tempDir, "tokens.json");
    await writeTokens(tokenPath, {
      version: 1,
      accessToken: "sk-ant-oat01-test",
      refreshToken: "sk-ant-ort01-test",
      expiresAt: Date.now() + 3600_000,
      scopes: ["user:inference"],
    });

    const oauthStrategy = new OAuthStrategy({
      tokenPath,
      tokenEndpoint: "https://platform.claude.com/v1/oauth/token",
      clientId: "test",
    });
    expect(await oauthStrategy.getHeaders()).toEqual({
      "x-api-key": "sk-ant-oat01-test",
    });
    expect(await oauthStrategy.isValid()).toBe(true);
  });
});
