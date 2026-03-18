import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import {
  createContainerManager,
  type ContainerManager,
  type ContainerOptions,
} from "../../../src/agent/container.js";

function processOptions(overrides?: Partial<ContainerOptions>): ContainerOptions {
  return {
    isolation: "process",
    maxMemory: 256,
    idleTimeout: 60,
    ...overrides,
  };
}

describe("ContainerManager", () => {
  let manager: ContainerManager;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(1000000);
    manager = createContainerManager();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("creates container with process isolation", async () => {
    const container = await manager.create("group-1", processOptions());

    expect(container.id).toBeTruthy();
    expect(container.status).toBe("running");
    expect(container.isolation).toBe("process");
    expect(container.createdAt).toBe(1000000);
    expect(container.lastActiveAt).toBe(1000000);
  });

  it("gets container by groupId", async () => {
    await manager.create("group-1", processOptions());

    const found = manager.get("group-1");
    expect(found).toBeDefined();
    expect(found!.isolation).toBe("process");

    const missing = manager.get("group-nonexistent");
    expect(missing).toBeUndefined();
  });

  it("destroys container", async () => {
    await manager.create("group-1", processOptions());
    expect(manager.get("group-1")).toBeDefined();

    await manager.destroy("group-1");

    expect(manager.get("group-1")).toBeUndefined();
  });

  it("getAll returns all containers", async () => {
    await manager.create("group-1", processOptions());
    await manager.create("group-2", processOptions());
    await manager.create("group-3", processOptions());

    const all = manager.getAll();
    expect(all).toHaveLength(3);

    const ids = all.map((c) => c.id);
    expect(new Set(ids).size).toBe(3);
  });

  it("destroyIdle removes stale containers", async () => {
    // Create containers with 60s idle timeout
    await manager.create("group-active", processOptions({ idleTimeout: 60 }));
    await manager.create("group-stale", processOptions({ idleTimeout: 60 }));

    // Advance 30s and mark one as active
    vi.setSystemTime(1030000);
    manager.markActive("group-active");

    // Advance to 61s after creation — group-stale should be idle
    vi.setSystemTime(1061000);

    const destroyed = await manager.destroyIdle();
    expect(destroyed).toBe(1);

    expect(manager.get("group-active")).toBeDefined();
    expect(manager.get("group-stale")).toBeUndefined();
  });

  it("markActive updates lastActiveAt", async () => {
    await manager.create("group-1", processOptions());
    const before = manager.get("group-1")!.lastActiveAt;

    vi.setSystemTime(1050000);
    manager.markActive("group-1");

    const after = manager.get("group-1")!.lastActiveAt;
    expect(after).toBe(1050000);
    expect(after).toBeGreaterThan(before);
  });

  it("handles container status transitions", async () => {
    const container = await manager.create("group-1", processOptions());
    expect(container.status).toBe("running");

    // After destroy, container should be removed from tracking
    await manager.destroy("group-1");
    expect(manager.get("group-1")).toBeUndefined();
  });

  it("rejects duplicate groupId on create", async () => {
    await manager.create("group-1", processOptions());
    await expect(manager.create("group-1", processOptions())).rejects.toThrow(
      /already exists/,
    );
  });

  it("destroy is no-op for unknown groupId", async () => {
    // Should not throw
    await expect(manager.destroy("nonexistent")).resolves.toBeUndefined();
  });

  it("apple-container falls back to process isolation", async () => {
    const container = await manager.create("group-apple", {
      isolation: "apple-container",
      maxMemory: 256,
      idleTimeout: 60,
    });

    // Should still create successfully, falling back to process mode
    expect(container.status).toBe("running");
    expect(container.isolation).toBe("process");
  });

  it("markActive is no-op for unknown groupId", () => {
    // Should not throw
    expect(() => manager.markActive("nonexistent")).not.toThrow();
  });
});
