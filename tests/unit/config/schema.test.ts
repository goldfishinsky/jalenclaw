// tests/unit/config/schema.test.ts
import { describe, it, expect } from "vitest";
import { claudeProviderConfig } from "../../../src/config/schema.js";

describe("claudeProviderConfig", () => {
  describe("apikey auth", () => {
    it("accepts valid apikey config", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "apikey",
        apiKey: "sk-ant-api03-test",
      });
      expect(result.success).toBe(true);
    });

    it("rejects config without authType", () => {
      const result = claudeProviderConfig.safeParse({
        apiKey: "sk-ant-api03-test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects apikey config without apiKey", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "apikey",
      });
      expect(result.success).toBe(false);
    });

    it("rejects apikey config with empty apiKey", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "apikey",
        apiKey: "",
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional base fields", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "apikey",
        apiKey: "sk-ant-api03-test",
        model: "claude-sonnet-4-20250514",
        timeout: 120,
        baseUrl: "https://api.anthropic.com",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("oauth auth", () => {
    it("accepts valid oauth config", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "oauth",
      });
      expect(result.success).toBe(true);
    });

    it("accepts oauth config with custom clientId", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "oauth",
        oauthClientId: "custom-client-id",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("oauthClientId", "custom-client-id");
      }
    });

    it("accepts oauth with optional base fields", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "oauth",
        model: "claude-sonnet-4-20250514",
        timeout: 60,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid", () => {
    it("rejects unknown authType", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "unknown",
      });
      expect(result.success).toBe(false);
    });
  });
});
