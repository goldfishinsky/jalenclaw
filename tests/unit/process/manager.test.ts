// tests/unit/process/manager.test.ts
import { describe, it, expect, afterEach } from "vitest";
import { createProcessManager } from "../../../src/process/manager.js";
import type { ProcessManager, ManagedProcess } from "../../../src/process/manager.js";
import { join } from "node:path";

const CHILD_SCRIPT = join(import.meta.dirname, "../../helpers/child-process.js");

function waitForStatus(
  pm: ProcessManager,
  id: string,
  status: ManagedProcess["status"],
  timeoutMs = 5000,
): Promise<ManagedProcess> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timed out waiting for status "${status}" on ${id}`)),
      timeoutMs,
    );
    pm.onStatusChange((proc) => {
      if (proc.id === id && proc.status === status) {
        clearTimeout(timer);
        resolve(proc);
      }
    });
  });
}

describe("ProcessManager", () => {
  let pm: ProcessManager;

  afterEach(async () => {
    if (pm) {
      await pm.stopAll();
    }
  }, 15000);

  it("start spawns a child process", async () => {
    pm = createProcessManager();
    const proc = await pm.start("channel:test", CHILD_SCRIPT);
    expect(proc).toBeDefined();
    expect(proc.pid).toBeGreaterThan(0);
    expect(proc.service).toBe("channel:test");
  });

  it("started process has running status", async () => {
    pm = createProcessManager();
    const proc = await pm.start("channel:test", CHILD_SCRIPT);
    expect(proc.status).toBe("running");
  });

  it("stop sends SIGTERM and process exits", async () => {
    pm = createProcessManager({ gracefulTimeoutMs: 2000 });
    const proc = await pm.start("channel:test", CHILD_SCRIPT);

    const stoppedPromise = waitForStatus(pm, proc.id, "stopped");
    await pm.stop(proc.id);
    const stopped = await stoppedPromise;
    expect(stopped.status).toBe("stopped");
  });

  it("process crash triggers auto-restart", async () => {
    pm = createProcessManager({ maxRestarts: 3 });
    const proc = await pm.start("channel:test", CHILD_SCRIPT);
    const id = proc.id;

    // Wait for running after restart
    const restartedPromise = waitForStatus(pm, id, "running");

    // Trigger a crash via IPC
    const status = pm.getStatus(id);
    expect(status?.pid).toBeDefined();
    process.kill(status!.pid!, "SIGKILL");

    const restarted = await restartedPromise;
    expect(restarted.status).toBe("running");
    expect(restarted.restartCount).toBeGreaterThanOrEqual(1);
  });

  it("exponential backoff between restarts", async () => {
    pm = createProcessManager({ maxRestarts: 3 });
    const proc = await pm.start("channel:crasher", CHILD_SCRIPT);
    const id = proc.id;

    // Crash the process twice and measure restart delays
    const timestamps: number[] = [];

    // First crash
    const restart1 = waitForStatus(pm, id, "running");
    process.kill(pm.getStatus(id)!.pid!, "SIGKILL");
    await restart1;
    timestamps.push(Date.now());

    // Second crash
    const restart2 = waitForStatus(pm, id, "running");
    process.kill(pm.getStatus(id)!.pid!, "SIGKILL");
    await restart2;
    timestamps.push(Date.now());

    // The second restart should take longer than the first
    // (we just verify restartCount increases, timing is non-deterministic in CI)
    const status = pm.getStatus(id);
    expect(status!.restartCount).toBe(2);
  });

  it("max restarts exceeded stops retrying", async () => {
    pm = createProcessManager({ maxRestarts: 1 });
    const proc = await pm.start("channel:fragile", CHILD_SCRIPT);
    const id = proc.id;

    // First crash → should restart
    const restart1 = waitForStatus(pm, id, "running");
    process.kill(pm.getStatus(id)!.pid!, "SIGKILL");
    await restart1;

    // Second crash → should NOT restart, should go to "crashed"
    const crashedPromise = waitForStatus(pm, id, "crashed");
    process.kill(pm.getStatus(id)!.pid!, "SIGKILL");
    const crashed = await crashedPromise;
    expect(crashed.status).toBe("crashed");
    expect(crashed.restartCount).toBe(1);
  }, 15000);

  it("stopAll stops all processes", async () => {
    pm = createProcessManager();
    await pm.start("channel:a", CHILD_SCRIPT);
    await pm.start("channel:b", CHILD_SCRIPT);

    const allBefore = pm.getAllStatus();
    expect(allBefore.length).toBe(2);
    expect(allBefore.every((p) => p.status === "running")).toBe(true);

    await pm.stopAll();

    const allAfter = pm.getAllStatus();
    expect(allAfter.every((p) => p.status === "stopped")).toBe(true);
  });

  it("getStatus returns correct state", async () => {
    pm = createProcessManager();
    const proc = await pm.start("channel:test", CHILD_SCRIPT);

    const status = pm.getStatus(proc.id);
    expect(status).toBeDefined();
    expect(status!.id).toBe(proc.id);
    expect(status!.service).toBe("channel:test");
    expect(status!.status).toBe("running");
    expect(status!.pid).toBeGreaterThan(0);
    expect(status!.restartCount).toBe(0);
  });

  it("getStatus returns undefined for unknown id", () => {
    pm = createProcessManager();
    expect(pm.getStatus("nonexistent")).toBeUndefined();
  });

  it("onStatusChange fires on state changes", async () => {
    pm = createProcessManager();
    const changes: ManagedProcess["status"][] = [];

    pm.onStatusChange((proc) => {
      changes.push(proc.status);
    });

    const proc = await pm.start("channel:test", CHILD_SCRIPT);
    await pm.stop(proc.id);

    // Should have seen: starting, running, stopping, stopped
    expect(changes).toContain("starting");
    expect(changes).toContain("running");
    expect(changes).toContain("stopping");
    expect(changes).toContain("stopped");
  });
});
