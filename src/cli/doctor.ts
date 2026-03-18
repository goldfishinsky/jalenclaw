// src/cli/doctor.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import * as net from "node:net";
import { parse as parseYaml } from "yaml";
import { jalenClawConfig } from "../config/schema.js";

export interface DiagnosticResult {
  name: string;
  status: "ok" | "warn" | "error";
  message: string;
}

export interface DoctorOptions {
  dataDir?: string;
  port?: number;
}

function getDataDir(options?: DoctorOptions): string {
  return options?.dataDir ?? path.join(os.homedir(), ".jalenclaw");
}

/**
 * Check if a port is available by attempting to listen on it.
 */
async function checkPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/**
 * Run all diagnostic checks and return results.
 */
export async function runDiagnostics(
  options?: DoctorOptions,
): Promise<DiagnosticResult[]> {
  const results: DiagnosticResult[] = [];
  const dataDir = getDataDir(options);
  const configPath = path.join(dataDir, "jalenclaw.yml");

  // Check 1: Config file exists
  let configExists = false;
  try {
    await fs.access(configPath);
    configExists = true;
    results.push({
      name: "config-exists",
      status: "ok",
      message: `Config file found at ${configPath}`,
    });
  } catch {
    results.push({
      name: "config-exists",
      status: "warn",
      message: `Config file not found at ${configPath}`,
    });
  }

  // Check 2: Config valid
  if (configExists) {
    try {
      const raw = await fs.readFile(configPath, "utf-8");
      const parsed = parseYaml(raw) ?? {};
      const result = jalenClawConfig.safeParse(parsed);
      if (result.success) {
        results.push({
          name: "config-valid",
          status: "ok",
          message: "Config file is valid",
        });
      } else {
        const issues = result.error.issues
          .map((i) => `${i.path.join(".")}: ${i.message}`)
          .join("; ");
        results.push({
          name: "config-valid",
          status: "error",
          message: `Config validation failed: ${issues}`,
        });
      }
    } catch (err) {
      results.push({
        name: "config-valid",
        status: "error",
        message: `Failed to parse config: ${err instanceof Error ? err.message : String(err)}`,
      });
    }
  }

  // Check 3: Port availability
  const port = options?.port ?? 18900;
  const portAvailable = await checkPort(port);
  if (portAvailable) {
    results.push({
      name: "port-available",
      status: "ok",
      message: `Port ${port} is available`,
    });
  } else {
    results.push({
      name: "port-available",
      status: "error",
      message: `Port ${port} is already in use`,
    });
  }

  // Check 4: SQLite accessible (data dir writable)
  try {
    const testFile = path.join(dataDir, ".doctor-test");
    await fs.writeFile(testFile, "test", "utf-8");
    await fs.unlink(testFile);
    results.push({
      name: "sqlite-accessible",
      status: "ok",
      message: "Data directory is writable",
    });
  } catch {
    results.push({
      name: "sqlite-accessible",
      status: "error",
      message: `Data directory is not writable: ${dataDir}`,
    });
  }

  // Check 5: Auth files permissions
  const authDir = path.join(dataDir, "auth");
  try {
    const stats = await fs.stat(authDir);
    const mode = stats.mode & 0o777;
    if (mode <= 0o700) {
      results.push({
        name: "auth-permissions",
        status: "ok",
        message: "Auth directory permissions are secure",
      });
    } else {
      results.push({
        name: "auth-permissions",
        status: "warn",
        message: `Auth directory permissions too open: ${mode.toString(8)} (should be 700 or stricter)`,
      });
    }
  } catch {
    results.push({
      name: "auth-permissions",
      status: "ok",
      message: "No auth directory found (not yet initialized)",
    });
  }

  return results;
}
