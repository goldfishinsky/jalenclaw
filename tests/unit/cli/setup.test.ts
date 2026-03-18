// tests/unit/cli/setup.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { parse as parseYaml } from "yaml";
import { createTempDir } from "../../helpers/index.js";
import {
  checkConfigExists,
  buildConfig,
  writeConfig,
  runSetupWizard,
  type SetupAnswers,
} from "../../../src/cli/setup.js";

describe("cli/setup", () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
  });

  afterEach(async () => {
    await cleanup();
    vi.restoreAllMocks();
  });

  describe("checkConfigExists", () => {
    it("returns false when no config file exists", async () => {
      const result = await checkConfigExists(join(tempDir, "nonexistent.yml"));
      expect(result).toBe(false);
    });

    it("returns true when config file exists", async () => {
      const configPath = join(tempDir, "jalenclaw.yml");
      const { writeFile } = await import("node:fs/promises");
      await writeFile(configPath, "gateway:\n  port: 18900\n", "utf-8");
      const result = await checkConfigExists(configPath);
      expect(result).toBe(true);
    });
  });

  describe("buildConfig", () => {
    it("generates config with Claude API key provider", () => {
      const answers: SetupAnswers = {
        provider: "claude",
        authMethod: "apikey",
        apiKey: "sk-ant-test-key",
        channel: "none",
        port: 18900,
      };
      const config = buildConfig(answers);
      expect(config.models).toEqual({
        default: "claude",
        providers: {
          claude: { authType: "apikey", apiKey: "sk-ant-test-key" },
        },
      });
    });

    it("generates config with Claude OAuth provider", () => {
      const answers: SetupAnswers = {
        provider: "claude",
        authMethod: "oauth",
        channel: "none",
        port: 18900,
      };
      const config = buildConfig(answers);
      expect(config.models).toEqual({
        default: "claude",
        providers: { claude: { authType: "oauth" } },
      });
    });

    it("generates config with OpenAI provider", () => {
      const answers: SetupAnswers = {
        provider: "openai",
        apiKey: "sk-openai-test",
        channel: "none",
        port: 18900,
      };
      const config = buildConfig(answers);
      expect(config.models).toEqual({
        default: "openai",
        providers: {
          openai: { authType: "apikey", apiKey: "sk-openai-test" },
        },
      });
    });

    it("generates config with Ollama provider", () => {
      const answers: SetupAnswers = {
        provider: "ollama",
        channel: "none",
        port: 18900,
      };
      const config = buildConfig(answers);
      expect(config.models).toEqual({
        default: "ollama",
        providers: { ollama: { baseUrl: "http://localhost:11434" } },
      });
    });

    it("includes selected channel in config", () => {
      const answers: SetupAnswers = {
        provider: "claude",
        authMethod: "apikey",
        apiKey: "sk-ant-test",
        channel: "telegram",
        telegramToken: "123456:ABC-DEF",
        port: 18900,
      };
      const config = buildConfig(answers);
      expect(config.channels).toEqual({
        telegram: { enabled: true, token: "123456:ABC-DEF" },
      });
    });

    it("includes no channels when none is selected", () => {
      const answers: SetupAnswers = {
        provider: "claude",
        authMethod: "apikey",
        apiKey: "sk-ant-test",
        channel: "none",
        port: 18900,
      };
      const config = buildConfig(answers);
      expect(config.channels).toEqual({});
    });

    it("sets custom gateway port", () => {
      const answers: SetupAnswers = {
        provider: "ollama",
        channel: "none",
        port: 9999,
      };
      const config = buildConfig(answers);
      expect(config.gateway).toEqual({ host: "127.0.0.1", port: 9999 });
    });
  });

  describe("writeConfig", () => {
    it("writes valid YAML config to disk", async () => {
      const configPath = join(tempDir, "jalenclaw.yml");
      const config = buildConfig({
        provider: "claude",
        authMethod: "apikey",
        apiKey: "sk-ant-test",
        channel: "none",
        port: 18900,
      });
      await writeConfig(config, tempDir, configPath);
      const content = await readFile(configPath, "utf-8");
      const parsed = parseYaml(content) as Record<string, unknown>;
      expect(parsed).toBeDefined();
      expect((parsed.gateway as Record<string, unknown>).port).toBe(18900);
    });

    it("creates config directory if it does not exist", async () => {
      const nested = join(tempDir, "deep", "nested");
      const configPath = join(nested, "jalenclaw.yml");
      await writeConfig({ gateway: { port: 18900 } }, nested, configPath);
      const content = await readFile(configPath, "utf-8");
      expect(content).toContain("18900");
    });
  });

  describe("runSetupWizard", () => {
    it("runs full wizard flow with collectAnswers and writes config", async () => {
      const configPath = join(tempDir, "jalenclaw.yml");
      vi.spyOn(console, "log").mockImplementation(() => {});

      await runSetupWizard({
        configDir: tempDir,
        configPath,
        collectAnswers: async () => ({
          provider: "ollama",
          channel: "none",
          port: 18900,
        }),
      });

      const exists = await checkConfigExists(configPath);
      expect(exists).toBe(true);

      const content = await readFile(configPath, "utf-8");
      const parsed = parseYaml(content) as Record<string, unknown>;
      expect((parsed.models as Record<string, unknown>).default).toBe("ollama");
    });

    it("triggers OAuth login when Claude OAuth is selected", async () => {
      const configPath = join(tempDir, "jalenclaw.yml");
      vi.spyOn(console, "log").mockImplementation(() => {});

      const onOAuthLogin = vi.fn().mockResolvedValue(undefined);

      await runSetupWizard({
        configDir: tempDir,
        configPath,
        collectAnswers: async () => ({
          provider: "claude",
          authMethod: "oauth",
          channel: "none",
          port: 18900,
        }),
        onOAuthLogin,
      });

      expect(onOAuthLogin).toHaveBeenCalledOnce();
    });
  });
});
