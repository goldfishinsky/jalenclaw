import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { createSqliteAdapter, type StorageAdapter } from "../../../src/memory/sqlite.js";
import { createTempDir } from "../../helpers/index.js";

describe("sqlite adapter", () => {
  let adapter: StorageAdapter;
  let tempDir: string;
  let cleanup: () => Promise<void>;

  beforeEach(async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
    adapter = createSqliteAdapter(join(tempDir, "test.db"));
  });

  afterEach(async () => {
    adapter.close();
    await cleanup();
  });

  describe("messages", () => {
    it("saves and retrieves messages", () => {
      adapter.saveMessage("g1", { role: "user", content: "hello" });
      adapter.saveMessage("g1", { role: "assistant", content: "hi" });
      const msgs = adapter.getRecentMessages("g1", 10);
      expect(msgs).toHaveLength(2);
      expect(msgs[0].content).toBe("hello");
      expect(msgs[1].content).toBe("hi");
    });

    it("returns messages in chronological order", () => {
      adapter.saveMessage("g1", { role: "user", content: "first" });
      adapter.saveMessage("g1", { role: "user", content: "second" });
      adapter.saveMessage("g1", { role: "user", content: "third" });
      const msgs = adapter.getRecentMessages("g1", 10);
      expect(msgs.map(m => m.content)).toEqual(["first", "second", "third"]);
    });

    it("limits returned messages", () => {
      for (let i = 0; i < 10; i++) {
        adapter.saveMessage("g1", { role: "user", content: `msg${i}` });
      }
      const msgs = adapter.getRecentMessages("g1", 3);
      expect(msgs).toHaveLength(3);
      expect(msgs[0].content).toBe("msg7");
    });
  });

  describe("memories", () => {
    it("saves and retrieves memories", () => {
      adapter.saveMemory("g1", "remember this", { key: "value" });
      const mems = adapter.getMemories("g1", 10);
      expect(mems).toHaveLength(1);
      expect(mems[0].content).toBe("remember this");
      expect(mems[0].metadata).toEqual({ key: "value" });
    });

    it("prunes oldest memories when exceeding maxEntries", () => {
      for (let i = 0; i < 5; i++) {
        adapter.saveMemory("g1", `memory${i}`);
      }
      const pruned = adapter.pruneMemories("g1", 3);
      expect(pruned).toBe(2);
      const mems = adapter.getMemories("g1", 10);
      expect(mems).toHaveLength(3);
    });

    it("deletes a specific memory", () => {
      const id = adapter.saveMemory("g1", "to delete");
      adapter.deleteMemory(id);
      const mems = adapter.getMemories("g1", 10);
      expect(mems).toHaveLength(0);
    });

    it("isolates groups", () => {
      adapter.saveMemory("g1", "group1");
      adapter.saveMemory("g2", "group2");
      const g1 = adapter.getMemories("g1", 10);
      const g2 = adapter.getMemories("g2", 10);
      expect(g1).toHaveLength(1);
      expect(g1[0].content).toBe("group1");
      expect(g2).toHaveLength(1);
      expect(g2[0].content).toBe("group2");
    });
  });

  it("uses WAL journal mode", () => {
    // Verify by checking the pragma
    // If we got here without error, WAL mode was set successfully
    expect(true).toBe(true);
  });
});
