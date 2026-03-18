// src/cli/backup.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { execSync } from "node:child_process";

export interface BackupOptions {
  dataDir?: string; // default ~/.jalenclaw
}

function getDataDir(options?: BackupOptions): string {
  return options?.dataDir ?? path.join(os.homedir(), ".jalenclaw");
}

function getBackupsDir(dataDir: string): string {
  return path.join(dataDir, "backups");
}

/**
 * Create a tar.gz backup of the data directory (excluding the backups folder itself).
 * Returns the absolute path to the created backup file.
 */
export async function createBackup(options?: BackupOptions): Promise<string> {
  const dataDir = getDataDir(options);
  const backupsDir = getBackupsDir(dataDir);

  // Ensure data dir exists
  try {
    await fs.access(dataDir);
  } catch {
    throw new Error(`Data directory does not exist: ${dataDir}`);
  }

  await fs.mkdir(backupsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupName = `jalenclaw-backup-${timestamp}.tar.gz`;
  const backupPath = path.join(backupsDir, backupName);

  execSync(
    `tar -czf "${backupPath}" --exclude="backups" -C "${path.dirname(dataDir)}" "${path.basename(dataDir)}"`,
  );

  return backupPath;
}

/**
 * Restore a backup archive into the data directory.
 * Extracts the tar.gz to the parent of the data directory.
 */
export async function restoreBackup(
  backupPath: string,
  options?: BackupOptions,
): Promise<void> {
  const dataDir = getDataDir(options);
  const resolvedBackupPath = path.resolve(backupPath);

  try {
    await fs.access(resolvedBackupPath);
  } catch {
    throw new Error(`Backup file not found: ${resolvedBackupPath}`);
  }

  // Ensure the parent directory of dataDir exists
  await fs.mkdir(path.dirname(dataDir), { recursive: true });

  execSync(`tar -xzf "${resolvedBackupPath}" -C "${path.dirname(dataDir)}"`);
}

/**
 * List all backup files in the backups directory, sorted newest first.
 */
export async function listBackups(options?: BackupOptions): Promise<string[]> {
  const dataDir = getDataDir(options);
  const backupsDir = getBackupsDir(dataDir);

  try {
    const entries = await fs.readdir(backupsDir);
    return entries
      .filter((f) => f.endsWith(".tar.gz"))
      .sort()
      .reverse()
      .map((f) => path.join(backupsDir, f));
  } catch {
    return [];
  }
}
