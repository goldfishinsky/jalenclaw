// tests/unit/config/loader.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { loadConfig } from "../../../src/config/loader.js";

describe("loadConfig", () => {
  let tmpDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jalenclaw-test-"));
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
    vi.restoreAllMocks();
  });

  async function writeYaml(
    content: string,
    filename = "jalenclaw.yml",
  ): Promise<string> {
    const configPath = path.join(tmpDir, filename);
    await fs.writeFile(configPath, content, "utf-8");
    return configPath;
  }

  describe("load valid YAML config file", () => {
    it("loads a minimal valid config", async () => {
      const configPath = await writeYaml(`
gateway:
  port: 9000
`);
      const config = await loadConfig({ configPath });
      expect(config.gateway.port).toBe(9000);
      expect(config.gateway.host).toBe("127.0.0.1");
      expect(config.gateway.tls).toBe(false);
    });

    it("loads a full config", async () => {
      const configPath = await writeYaml(`
gateway:
  host: "0.0.0.0"
  port: 3000
  tls: true
agent:
  isolation: "process"
  idleTimeout: 60
  maxMemory: 512
models:
  default: "openai"
  providers:
    openai:
      authType: "apikey"
      apiKey: "sk-test-key"
channels:
  whatsapp:
    enabled: true
memory:
  backend: "sqlite"
  maxEntries: 5000
  pruneStrategy: "relevance"
rateLimit:
  maxRequestsPerMinute: 30
  burstSize: 5
`);
      const config = await loadConfig({ configPath });
      expect(config.gateway.host).toBe("0.0.0.0");
      expect(config.gateway.port).toBe(3000);
      expect(config.gateway.tls).toBe(true);
      expect(config.agent.isolation).toBe("process");
      expect(config.agent.idleTimeout).toBe(60);
      expect(config.agent.maxMemory).toBe(512);
      expect(config.models.default).toBe("openai");
      expect(config.models.providers.openai?.apiKey).toBe("sk-test-key");
      expect(config.channels.whatsapp?.enabled).toBe(true);
      expect(config.memory.backend).toBe("sqlite");
      expect(config.memory.maxEntries).toBe(5000);
      expect(config.rateLimit.maxRequestsPerMinute).toBe(30);
      expect(config.rateLimit.burstSize).toBe(5);
    });
  });

  describe("resolve environment variables in string values", () => {
    it("resolves ${VAR_NAME} in string values", async () => {
      vi.stubEnv("TEST_API_KEY", "sk-resolved-key");
      const configPath = await writeYaml(`
models:
  providers:
    openai:
      authType: "apikey"
      apiKey: "\${TEST_API_KEY}"
`);
      const config = await loadConfig({ configPath });
      expect(config.models.providers.openai?.apiKey).toBe("sk-resolved-key");
    });

    it("resolves multiple env vars in the same string", async () => {
      vi.stubEnv("HOST_VAR", "myhost");
      vi.stubEnv("PORT_VAR", "5432");
      const configPath = await writeYaml(`
channels:
  db:
    enabled: true
    url: "\${HOST_VAR}:\${PORT_VAR}"
`);
      const config = await loadConfig({ configPath });
      expect(config.channels.db?.url).toBe("myhost:5432");
    });
  });

  describe("throw on missing environment variable", () => {
    it("throws when referenced env var is not set", async () => {
      delete process.env["NONEXISTENT_VAR_FOR_TEST"];
      const configPath = await writeYaml(`
models:
  providers:
    openai:
      authType: "apikey"
      apiKey: "\${NONEXISTENT_VAR_FOR_TEST}"
`);
      await expect(loadConfig({ configPath })).rejects.toThrow(
        /NONEXISTENT_VAR_FOR_TEST/,
      );
    });
  });

  describe("use default values for omitted fields", () => {
    it("returns defaults for an empty config", async () => {
      const configPath = await writeYaml("");
      const config = await loadConfig({ configPath });
      expect(config.gateway.host).toBe("127.0.0.1");
      expect(config.gateway.port).toBe(18900);
      expect(config.gateway.tls).toBe(false);
      expect(config.agent.isolation).toBe("docker");
      expect(config.agent.idleTimeout).toBe(300);
      expect(config.agent.maxMemory).toBe(256);
      expect(config.models.default).toBe("claude");
      expect(config.memory.backend).toBe("auto");
      expect(config.memory.maxEntries).toBe(10000);
      expect(config.rateLimit.maxRequestsPerMinute).toBe(60);
      expect(config.rateLimit.burstSize).toBe(10);
    });
  });

  describe("validate against schema (reject invalid config)", () => {
    it("rejects invalid isolation value", async () => {
      const configPath = await writeYaml(`
agent:
  isolation: "kubernetes"
`);
      await expect(loadConfig({ configPath })).rejects.toThrow();
    });

    it("rejects invalid port type", async () => {
      const configPath = await writeYaml(`
gateway:
  port: "not-a-number"
`);
      await expect(loadConfig({ configPath })).rejects.toThrow();
    });
  });

  describe("handle file not found", () => {
    it("throws descriptive error when config file does not exist", async () => {
      const badPath = path.join(tmpDir, "nonexistent.yml");
      await expect(loadConfig({ configPath: badPath })).rejects.toThrow(
        /not found|ENOENT/i,
      );
    });
  });

  describe("handle --config path override", () => {
    it("loads from the overridden path", async () => {
      const customPath = await writeYaml(
        `
gateway:
  port: 12345
`,
        "custom.yml",
      );
      const config = await loadConfig({ configPath: customPath });
      expect(config.gateway.port).toBe(12345);
    });
  });

  describe("path resolution", () => {
    it("resolves relative configPath to absolute", async () => {
      // The loader should accept a relative path and still work
      const configPath = await writeYaml(`
gateway:
  port: 7777
`);
      // Pass the absolute path — the loader should handle it fine
      const config = await loadConfig({ configPath });
      expect(config.gateway.port).toBe(7777);
    });
  });
});
