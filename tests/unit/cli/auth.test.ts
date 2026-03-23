// tests/unit/cli/auth.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { Command } from "commander";
import { join } from "node:path";
import { createTempDir } from "../../helpers/index.js";
import {
  writeTokens,
  type OAuthCredentials,
} from "../../../src/auth/token-store.js";
import {
  registerAuthCommands,
  buildAuthorizationUrl,
  loginFlow,
  logoutFlow,
  statusFlow,
  refreshFlow,
} from "../../../src/cli/auth.js";

const validTokens: OAuthCredentials = {
  version: 1,
  accessToken: "sk-ant-oat01-test-access-token",
  refreshToken: "sk-ant-ort01-test-refresh-token",
  expiresAt: Date.now() + 3600_000,
  scopes: ["user:inference", "user:profile"],
};

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
    vi.restoreAllMocks();
  });

  describe("registerAuthCommands", () => {
    it("adds auth subcommand with login, logout, status, and refresh", () => {
      const program = new Command();
      registerAuthCommands(program);

      const authCmd = program.commands.find((c) => c.name() === "auth");
      expect(authCmd).toBeDefined();

      const subcommandNames = authCmd!.commands.map((c) => c.name());
      expect(subcommandNames).toContain("login");
      expect(subcommandNames).toContain("logout");
      expect(subcommandNames).toContain("status");
      expect(subcommandNames).toContain("refresh");
    });
  });

  describe("logoutFlow", () => {
    it("deletes token file", async () => {
      await writeTokens(tokenPath, validTokens);

      const output = await logoutFlow({ tokenPath });

      expect(output.success).toBe(true);
      expect(output.message).toMatch(/logged out/i);

      // Verify file is gone
      const { readTokens } = await import("../../../src/auth/token-store.js");
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });
  });

  describe("statusFlow", () => {
    it("shows 'Not authenticated' when no tokens exist", async () => {
      const output = await statusFlow({ tokenPath });

      expect(output.authenticated).toBe(false);
      expect(output.message).toMatch(/not authenticated/i);
    });

    it("shows token info when tokens exist", async () => {
      await writeTokens(tokenPath, validTokens);

      const output = await statusFlow({ tokenPath });

      expect(output.authenticated).toBe(true);
      expect(output.expiresAt).toBe(validTokens.expiresAt);
      expect(output.scopes).toEqual(validTokens.scopes);
    });
  });

  describe("buildAuthorizationUrl", () => {
    it("generates correct authorization URL with all parameters", () => {
      const url = buildAuthorizationUrl({
        clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        redirectUri: "http://127.0.0.1:9999/callback",
        codeChallenge: "test-challenge",
        challengeMethod: "S256",
        scopes: "user:inference user:profile",
        state: "test-state",
      });

      const parsed = new URL(url);
      expect(parsed.origin).toBe("https://console.anthropic.com");
      expect(parsed.pathname).toBe("/oauth/authorize");
      expect(parsed.searchParams.get("client_id")).toBe("9d1c250a-e61b-44d9-88ed-5944d1962f5e");
      expect(parsed.searchParams.get("redirect_uri")).toBe(
        "http://127.0.0.1:9999/callback",
      );
      expect(parsed.searchParams.get("code_challenge")).toBe("test-challenge");
      expect(parsed.searchParams.get("code_challenge_method")).toBe("S256");
      expect(parsed.searchParams.get("scope")).toBe(
        "user:inference user:profile",
      );
      expect(parsed.searchParams.get("state")).toBe("test-state");
      expect(parsed.searchParams.get("response_type")).toBe("code");
    });
  });

  describe("loginFlow", () => {
    it("exchanges code for tokens via token endpoint", async () => {
      const mockTokenResponse: OAuthCredentials = {
        version: 1,
        accessToken: "sk-ant-oat01-new-token",
        refreshToken: "sk-ant-ort01-new-refresh",
        expiresAt: Date.now() + 7200_000,
        scopes: ["user:inference", "user:profile"],
      };

      const tokenResponseBody = JSON.stringify({
        access_token: mockTokenResponse.accessToken,
        refresh_token: mockTokenResponse.refreshToken,
        expires_in: 7200,
        scope: "user:inference user:profile",
      });
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(tokenResponseBody),
      });

      const result = await loginFlow({
        tokenPath,
        code: "test-auth-code",
        codeVerifier: "test-verifier",
        redirectUri: "http://127.0.0.1:9999/callback",
        clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        fetchFn: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/oauth/token");
      expect(options.method).toBe("POST");

      const body = new URLSearchParams(options.body);
      expect(body.get("grant_type")).toBe("authorization_code");
      expect(body.get("code")).toBe("test-auth-code");
      expect(body.get("code_verifier")).toBe("test-verifier");
      expect(body.get("redirect_uri")).toBe(
        "http://127.0.0.1:9999/callback",
      );
      expect(body.get("client_id")).toBe("9d1c250a-e61b-44d9-88ed-5944d1962f5e");

      // Verify tokens were persisted
      const { readTokens } = await import("../../../src/auth/token-store.js");
      const stored = await readTokens(tokenPath);
      expect(stored).not.toBeNull();
      expect(stored!.accessToken).toBe(mockTokenResponse.accessToken);
      expect(stored!.refreshToken).toBe(mockTokenResponse.refreshToken);
    });
  });

  describe("refreshFlow", () => {
    it("calls token endpoint with refresh_token grant", async () => {
      await writeTokens(tokenPath, validTokens);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () =>
          Promise.resolve({
            access_token: "sk-ant-oat01-refreshed",
            refresh_token: "sk-ant-ort01-refreshed",
            expires_in: 3600,
            scope: "user:inference user:profile",
          }),
      });

      const result = await refreshFlow({
        tokenPath,
        clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        fetchFn: mockFetch,
      });

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledOnce();

      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe("https://api.anthropic.com/oauth/token");
      expect(options.method).toBe("POST");

      const body = new URLSearchParams(options.body);
      expect(body.get("grant_type")).toBe("refresh_token");
      expect(body.get("refresh_token")).toBe(validTokens.refreshToken);
      expect(body.get("client_id")).toBe("9d1c250a-e61b-44d9-88ed-5944d1962f5e");

      // Verify updated tokens were persisted
      const { readTokens } = await import("../../../src/auth/token-store.js");
      const stored = await readTokens(tokenPath);
      expect(stored).not.toBeNull();
      expect(stored!.accessToken).toBe("sk-ant-oat01-refreshed");
    });

    it("returns error when no tokens are stored", async () => {
      const mockFetch = vi.fn();

      const result = await refreshFlow({
        tokenPath,
        clientId: "9d1c250a-e61b-44d9-88ed-5944d1962f5e",
        fetchFn: mockFetch,
      });

      expect(result.success).toBe(false);
      expect(result.message).toMatch(/no.*token/i);
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
