// tests/unit/cli/backup.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import {
  createBackup,
  listBackups,
  restoreBackup,
} from "../../../src/cli/backup.js";

describe("cli/backup", () => {
  let tmpDir: string;
  let dataDir: string;

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "jalenclaw-backup-test-"));
    dataDir = path.join(tmpDir, ".jalenclaw");
    await fs.mkdir(dataDir, { recursive: true });
    // Create a sample config file inside the data dir
    await fs.writeFile(
      path.join(dataDir, "jalenclaw.yml"),
      "gateway:\n  port: 9000\n",
      "utf-8",
    );
    // Create a sample db file
    await fs.writeFile(path.join(dataDir, "data.db"), "fake-db-content");
  });

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  describe("createBackup", () => {
    it("creates a backup archive", async () => {
      const backupPath = await createBackup({ dataDir });
      expect(backupPath).toContain("jalenclaw-backup-");
      expect(backupPath).toContain(".tar.gz");

      // Verify the file actually exists
      const stat = await fs.stat(backupPath);
      expect(stat.size).toBeGreaterThan(0);
    });

    it("throws when data directory does not exist", async () => {
      const badDir = path.join(tmpDir, "nonexistent");
      await expect(createBackup({ dataDir: badDir })).rejects.toThrow(
        /does not exist/,
      );
    });
  });

  describe("listBackups", () => {
    it("lists backup files", async () => {
      await createBackup({ dataDir });
      await createBackup({ dataDir });

      const backups = await listBackups({ dataDir });
      expect(backups.length).toBeGreaterThanOrEqual(2);
      for (const b of backups) {
        expect(b).toContain(".tar.gz");
      }
    });

    it("returns empty array when no backups exist", async () => {
      const backups = await listBackups({ dataDir });
      expect(backups).toEqual([]);
    });
  });

  describe("restoreBackup", () => {
    it("restores from a backup", async () => {
      const backupPath = await createBackup({ dataDir });

      // Modify the config
      await fs.writeFile(
        path.join(dataDir, "jalenclaw.yml"),
        "gateway:\n  port: 1111\n",
        "utf-8",
      );

      // Restore
      await restoreBackup(backupPath, { dataDir });

      // Verify original content is restored
      const content = await fs.readFile(
        path.join(dataDir, "jalenclaw.yml"),
        "utf-8",
      );
      expect(content).toContain("port: 9000");
    });
  });

  describe("handles missing data dir", () => {
    it("returns empty list for missing data dir", async () => {
      const missingDir = path.join(tmpDir, "does-not-exist");
      const backups = await listBackups({ dataDir: missingDir });
      expect(backups).toEqual([]);
    });
  });
});
