// src/process/health.ts
import type { ManagedProcess, ProcessManager } from "./manager.js";

export interface HealthStatus {
  healthy: boolean;
  pid: number;
  memoryUsage: number;
  uptime: number;
}

export interface HealthChecker {
  check(process: ManagedProcess): Promise<HealthStatus>;
  startMonitoring(processManager: ProcessManager, intervalMs?: number): void;
  stopMonitoring(): void;
}

const DEFAULT_INTERVAL_MS = 30_000;

/**
 * Check if a process with the given PID is alive by sending signal 0.
 */
function isProcessAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Read memory usage for a PID via /proc on Linux or ps on macOS.
 */
async function getProcessMemory(pid: number): Promise<number> {
  try {
    const { execSync } = await import("node:child_process");
    // ps -o rss= gives resident set size in KB
    const output = execSync(`ps -o rss= -p ${pid}`, { encoding: "utf8" }).trim();
    const rssKb = parseInt(output, 10);
    if (isNaN(rssKb)) return 0;
    return rssKb * 1024; // Convert KB to bytes
  } catch {
    return 0;
  }
}

export function createHealthChecker(): HealthChecker {
  let intervalHandle: ReturnType<typeof setInterval> | null = null;

  async function check(managed: ManagedProcess): Promise<HealthStatus> {
    const pid = managed.pid;

    if (!pid || managed.status === "crashed" || managed.status === "stopped") {
      return {
        healthy: false,
        pid: pid ?? 0,
        memoryUsage: 0,
        uptime: 0,
      };
    }

    const alive = isProcessAlive(pid);
    if (!alive) {
      return {
        healthy: false,
        pid,
        memoryUsage: 0,
        uptime: 0,
      };
    }

    const memoryUsage = await getProcessMemory(pid);

    return {
      healthy: true,
      pid,
      memoryUsage,
      uptime: 0, // Would need startedAt tracking for real uptime
    };
  }

  function startMonitoring(processManager: ProcessManager, intervalMs?: number): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
    }

    const interval = intervalMs ?? DEFAULT_INTERVAL_MS;

    intervalHandle = setInterval(async () => {
      const allProcesses = processManager.getAllStatus();
      for (const proc of allProcesses) {
        if (proc.status === "running") {
          // Use checker.check so test overrides are respected
          await checker.check(proc);
        }
      }
    }, interval);
  }

  function stopMonitoring(): void {
    if (intervalHandle) {
      clearInterval(intervalHandle);
      intervalHandle = null;
    }
  }

  const checker: HealthChecker = {
    check,
    startMonitoring,
    stopMonitoring,
  };

  return checker;
}
