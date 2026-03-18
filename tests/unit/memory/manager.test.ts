import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { createMemoryManager, type MemoryManager } from "../../../src/memory/manager.js";
import { createSqliteAdapter } from "../../../src/memory/sqlite.js";
import { createTempDir } from "../../helpers/index.js";

describe("memory manager", () => {
  let manager: MemoryManager;
  let tempDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
    const storage = createSqliteAdapter(join(tempDir, "test.db"));
    manager = createMemoryManager({ storage, maxShortTermMessages: 5, maxLongTermMemories: 3 });
  });

  afterEach(async () => {
    manager.close();
    await cleanup();
  });

  it("adds and retrieves messages", () => {
    manager.addMessage("g1", "user", "hello");
    manager.addMessage("g1", "assistant", "hi");
    const ctx = manager.getContext("g1");
    expect(ctx).toHaveLength(2);
    expect(ctx[0]).toEqual({ role: "user", content: "hello" });
  });

  it("limits short-term context", () => {
    for (let i = 0; i < 10; i++) {
      manager.addMessage("g1", "user", `msg${i}`);
    }
    const ctx = manager.getContext("g1");
    expect(ctx).toHaveLength(5);
  });

  it("remembers and recalls", () => {
    manager.remember("g1", "important fact", { source: "test" });
    const recalled = manager.recall("g1");
    expect(recalled).toHaveLength(1);
    expect(recalled[0].content).toBe("important fact");
  });

  it("forgets a memory", () => {
    manager.remember("g1", "forget me");
    const recalled = manager.recall("g1");
    manager.forget("g1", recalled[0].id);
    expect(manager.recall("g1")).toHaveLength(0);
  });

  it("auto-prunes when exceeding max", () => {
    for (let i = 0; i < 5; i++) {
      manager.remember("g1", `memory${i}`);
    }
    const recalled = manager.recall("g1", 10);
    expect(recalled.length).toBeLessThanOrEqual(3);
  });

  it("isolates groups", () => {
    manager.addMessage("g1", "user", "g1 msg");
    manager.addMessage("g2", "user", "g2 msg");
    manager.remember("g1", "g1 mem");
    manager.remember("g2", "g2 mem");
    expect(manager.getContext("g1")).toHaveLength(1);
    expect(manager.getContext("g2")).toHaveLength(1);
    expect(manager.recall("g1")[0].content).toBe("g1 mem");
    expect(manager.recall("g2")[0].content).toBe("g2 mem");
  });
});
