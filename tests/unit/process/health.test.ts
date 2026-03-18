// tests/unit/process/health.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createHealthChecker } from "../../../src/process/health.js";
import { createProcessManager } from "../../../src/process/manager.js";
import type { ProcessManager, ManagedProcess } from "../../../src/process/manager.js";
import type { HealthChecker } from "../../../src/process/health.js";
import { join } from "node:path";

const CHILD_SCRIPT = join(import.meta.dirname, "../../helpers/child-process.js");

describe("HealthChecker", () => {
  let pm: ProcessManager;
  let hc: HealthChecker;

  afterEach(async () => {
    if (hc) hc.stopMonitoring();
    if (pm) await pm.stopAll();
  }, 15000);

  it("reports healthy for running process", async () => {
    pm = createProcessManager();
    hc = createHealthChecker();
    const proc = await pm.start("channel:test", CHILD_SCRIPT);

    const health = await hc.check(proc);
    expect(health.healthy).toBe(true);
    expect(health.pid).toBe(proc.pid);
  });

  it("reports memory usage", async () => {
    pm = createProcessManager();
    hc = createHealthChecker();
    const proc = await pm.start("channel:test", CHILD_SCRIPT);

    const health = await hc.check(proc);
    expect(health.memoryUsage).toBeGreaterThan(0);
  });

  it("detects crashed process", async () => {
    pm = createProcessManager({ maxRestarts: 0 });
    hc = createHealthChecker();
    const proc = await pm.start("channel:test", CHILD_SCRIPT);

    // Kill the process
    process.kill(proc.pid!, "SIGKILL");
    // Wait for process manager to detect crash
    await new Promise((r) => setTimeout(r, 1000));

    const status = pm.getStatus(proc.id);
    const health = await hc.check(status!);
    expect(health.healthy).toBe(false);
  }, 15000);

  it("monitoring interval triggers periodic checks", async () => {
    pm = createProcessManager();
    hc = createHealthChecker();
    await pm.start("channel:test", CHILD_SCRIPT);

    const checkResults: boolean[] = [];
    const origCheck = hc.check.bind(hc);
    hc.check = async (p: ManagedProcess) => {
      const result = await origCheck(p);
      checkResults.push(result.healthy);
      return result;
    };

    hc.startMonitoring(pm, 300);

    // Wait for a few check cycles
    await new Promise((r) => setTimeout(r, 1200));
    hc.stopMonitoring();

    // Should have triggered at least 2 checks
    expect(checkResults.length).toBeGreaterThanOrEqual(2);
  }, 15000);
});
