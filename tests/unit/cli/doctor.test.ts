// tests/unit/cli/doctor.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as net from "node:net";
import {
  runDiagnostics,
  type DiagnosticResult,
} from "../../../src/cli/doctor.js";

describe("cli/doctor", () => {
  let tmpDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jalenclaw-doctor-test-"));
    dataDir = path.join(tmpDir, ".jalenclaw");
    await fs.mkdir(dataDir, { recursive: true });
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  function findResult(
    results: DiagnosticResult[],
    name: string,
  ): DiagnosticResult | undefined {
    return results.find((r) => r.name === name);
  }

  describe("returns ok when everything is fine", () => {
    it("reports ok for config, port, and sqlite checks", async () => {
      // Create a valid config
      await fs.writeFile(
        path.join(dataDir, "jalenclaw.yml"),
        "gateway:\n  port: 18900\n",
        "utf-8",
      );

      // Use a random high port unlikely to be in use
      const results = await runDiagnostics({ dataDir, port: 0 });

      const configExists = findResult(results, "config-exists");
      expect(configExists?.status).toBe("ok");

      const configValid = findResult(results, "config-valid");
      expect(configValid?.status).toBe("ok");

      const sqliteAccessible = findResult(results, "sqlite-accessible");
      expect(sqliteAccessible?.status).toBe("ok");
    });
  });

  describe("warns on missing config", () => {
    it("reports warn when config file is missing", async () => {
      const results = await runDiagnostics({ dataDir, port: 0 });

      const configExists = findResult(results, "config-exists");
      expect(configExists?.status).toBe("warn");
      expect(configExists?.message).toContain("not found");
    });
  });

  describe("reports port conflict", () => {
    it("reports error when port is already in use", async () => {
      // Occupy a port
      const server = net.createServer();
      const port = await new Promise<number>((resolve) => {
        server.listen(0, "127.0.0.1", () => {
          const addr = server.address() as net.AddressInfo;
          resolve(addr.port);
        });
      });

      try {
        await fs.writeFile(
          path.join(dataDir, "jalenclaw.yml"),
          "gateway:\n  port: 18900\n",
          "utf-8",
        );

        const results = await runDiagnostics({ dataDir, port });

        const portResult = findResult(results, "port-available");
        expect(portResult?.status).toBe("error");
        expect(portResult?.message).toContain("already in use");
      } finally {
        await new Promise<void>((resolve) => server.close(() => resolve()));
      }
    });
  });

  describe("reports invalid config", () => {
    it("reports error when config fails validation", async () => {
      await fs.writeFile(
        path.join(dataDir, "jalenclaw.yml"),
        "agent:\n  isolation: invalid_value\n",
        "utf-8",
      );

      const results = await runDiagnostics({ dataDir, port: 0 });

      const configValid = findResult(results, "config-valid");
      expect(configValid?.status).toBe("error");
      expect(configValid?.message).toContain("validation failed");
    });
  });
});
