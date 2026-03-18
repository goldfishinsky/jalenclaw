// tests/unit/config/migrate.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  migrateConfig,
  getCurrentVersion,
  registerMigration,
  resetMigrations,
} from "../../../src/config/migrate.js";

describe("config/migrate", () => {
  afterEach(() => {
    resetMigrations();
  });

  describe("getCurrentVersion", () => {
    it("returns 0 for versionless config", () => {
      const config = { gateway: { port: 3000 } };
      expect(getCurrentVersion(config)).toBe(0);
    });

    it("returns the configVersion when present", () => {
      const config = { configVersion: 3 };
      expect(getCurrentVersion(config)).toBe(3);
    });

    it("returns 0 for non-integer configVersion", () => {
      const config = { configVersion: "abc" };
      expect(getCurrentVersion(config)).toBe(0);
    });
  });

  describe("migrateConfig", () => {
    it("returns config unchanged if already at target version", () => {
      const config = {
        configVersion: 1,
        gateway: { port: 9000 },
      };
      const result = migrateConfig(config, 1);
      expect(result).toEqual(config);
    });

    it("migrates v0 to v1 — adds authType to claude provider", () => {
      const config = {
        models: {
          default: "claude",
          providers: {
            claude: {
              apiKey: "sk-test",
            },
          },
        },
      };
      const result = migrateConfig(config, 1);
      expect(getCurrentVersion(result)).toBe(1);

      const claude = (
        (result.models as Record<string, unknown>).providers as Record<
          string,
          unknown
        >
      ).claude as Record<string, unknown>;
      expect(claude.authType).toBe("apikey");
      expect(claude.apiKey).toBe("sk-test");
    });

    it("migrates v0 to v1 — no-op when claude provider already has authType", () => {
      const config = {
        models: {
          providers: {
            claude: {
              authType: "oauth",
              oauthClientId: "client-123",
            },
          },
        },
      };
      const result = migrateConfig(config, 1);
      expect(getCurrentVersion(result)).toBe(1);

      const claude = (
        (result.models as Record<string, unknown>).providers as Record<
          string,
          unknown
        >
      ).claude as Record<string, unknown>;
      expect(claude.authType).toBe("oauth");
    });

    it("multi-step migration v0 → v1 → v2", () => {
      registerMigration({
        fromVersion: 1,
        toVersion: 2,
        migrate(config) {
          return {
            ...config,
            configVersion: 2,
            rateLimit: { maxRequestsPerMinute: 120, burstSize: 20 },
          };
        },
      });

      const config = {
        models: {
          default: "claude",
          providers: {
            claude: { apiKey: "sk-test" },
          },
        },
      };

      const result = migrateConfig(config, 2);
      expect(getCurrentVersion(result)).toBe(2);

      const rateLimit = result.rateLimit as Record<string, unknown>;
      expect(rateLimit.maxRequestsPerMinute).toBe(120);

      // v1 migration should also have been applied
      const claude = (
        (result.models as Record<string, unknown>).providers as Record<
          string,
          unknown
        >
      ).claude as Record<string, unknown>;
      expect(claude.authType).toBe("apikey");
    });

    it("preserves unknown fields during migration", () => {
      const config = {
        customPlugin: { enabled: true, data: [1, 2, 3] },
        models: {
          providers: {
            claude: { apiKey: "sk-test" },
          },
        },
      };
      const result = migrateConfig(config, 1);
      expect(result.customPlugin).toEqual({ enabled: true, data: [1, 2, 3] });
    });

    it("throws when no migration path exists", () => {
      const config = { configVersion: 5 };
      expect(() => migrateConfig(config, 10)).toThrow(/No migration path/);
    });
  });
});
