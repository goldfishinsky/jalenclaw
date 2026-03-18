// tests/unit/auth/oauth.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { createTempDir } from "../../helpers/index.js";
import { writeTokens, type OAuthCredentials } from "../../../src/auth/token-store.js";
import { OAuthStrategy } from "../../../src/auth/oauth.js";

// Mock the token refresh HTTP call
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OAuthStrategy", () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;
  let tokenPath: string;
  let validTokens: OAuthCredentials;
  let expiredTokens: OAuthCredentials;

  beforeEach(async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
    tokenPath = join(tempDir, "oauth-credentials.json");
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    validTokens = {
      version: 1,
      accessToken: "sk-ant-oat01-valid",
      refreshToken: "sk-ant-ort01-valid",
      expiresAt: Date.now() + 3600_000, // 1 hour from now
      scopes: ["user:inference", "user:profile"],
    };

    expiredTokens = {
      ...validTokens,
      expiresAt: Date.now() - 1000, // expired
    };
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  describe("getHeaders", () => {
    it("returns Bearer header with valid token", async () => {
      await writeTokens(tokenPath, validTokens);
      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      const headers = await strategy.getHeaders();
      expect(headers).toEqual({
        Authorization: "Bearer sk-ant-oat01-valid",
      });
    });

    it("refreshes token when expired", async () => {
      await writeTokens(tokenPath, expiredTokens);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "sk-ant-oat01-refreshed",
          refresh_token: "sk-ant-ort01-refreshed",
          expires_in: 3600,
        }),
      });

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      const headers = await strategy.getHeaders();
      expect(headers).toEqual({
        Authorization: "Bearer sk-ant-oat01-refreshed",
      });
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("throws when refresh returns non-ok response", async () => {
      await writeTokens(tokenPath, expiredTokens);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      await expect(strategy.getHeaders()).rejects.toThrow("Token refresh failed: 400");
    });

    it("throws when no tokens exist", async () => {
      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      await expect(strategy.getHeaders()).rejects.toThrow();
    });
  });

  describe("isValid", () => {
    it("returns true when token exists and not expired", async () => {
      await writeTokens(tokenPath, validTokens);
      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });
      expect(await strategy.isValid()).toBe(true);
    });

    it("returns false when no token file", async () => {
      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });
      expect(await strategy.isValid()).toBe(false);
    });
  });

  describe("circuit breaker", () => {
    it("enters open state after 3 consecutive refresh failures", async () => {
      await writeTokens(tokenPath, expiredTokens);
      mockFetch.mockRejectedValue(new Error("network error"));

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      // Exhaust 3 failures
      for (let i = 0; i < 3; i++) {
        await expect(strategy.getHeaders()).rejects.toThrow();
      }

      // 4th call should fail immediately with circuit breaker message
      await expect(strategy.getHeaders()).rejects.toThrow(
        /jalenclaw auth login/,
      );
      // No additional fetch calls (circuit is open)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("resets after cooldown period", async () => {
      await writeTokens(tokenPath, expiredTokens);
      mockFetch.mockRejectedValue(new Error("network error"));

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
        circuitBreakerCooldownMs: 1000,
      });

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await expect(strategy.getHeaders()).rejects.toThrow();
      }

      // Advance past cooldown
      vi.advanceTimersByTime(1500);

      // Now it should try again (and fail, but the point is it tries)
      mockFetch.mockRejectedValueOnce(new Error("still failing"));
      await expect(strategy.getHeaders()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe("proactive refresh", () => {
    it("refreshes token within 5 minutes of expiry", async () => {
      const soonExpiring: OAuthCredentials = {
        ...validTokens,
        expiresAt: Date.now() + 4 * 60 * 1000, // 4 minutes from now
      };
      await writeTokens(tokenPath, soonExpiring);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "sk-ant-oat01-proactive",
          refresh_token: "sk-ant-ort01-proactive",
          expires_in: 3600,
        }),
      });

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      const headers = await strategy.getHeaders();
      expect(headers.Authorization).toBe("Bearer sk-ant-oat01-proactive");
    });
  });
});
