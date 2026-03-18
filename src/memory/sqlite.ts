import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";

export interface StorageAdapter {
  saveMessage(groupId: string, message: { role: string; content: string }): string;
  getRecentMessages(groupId: string, limit: number): Array<{ id: string; role: string; content: string; timestamp: number }>;
  saveMemory(groupId: string, content: string, metadata?: Record<string, unknown>): string;
  getMemories(groupId: string, limit: number): Array<{ id: string; content: string; metadata?: Record<string, unknown>; lastAccessedAt: number }>;
  deleteMemory(id: string): void;
  pruneMemories(groupId: string, maxEntries: number): number;
  close(): void;
}

export function createSqliteAdapter(dbPath: string): StorageAdapter {
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");

  db.exec(`
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      content TEXT NOT NULL,
      metadata TEXT,
      created_at INTEGER NOT NULL,
      last_accessed_at INTEGER NOT NULL,
      access_count INTEGER DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_memories_group ON memories(group_id);
    CREATE INDEX IF NOT EXISTS idx_memories_accessed ON memories(last_accessed_at);

    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      group_id TEXT NOT NULL,
      role TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_messages_group ON messages(group_id, timestamp);
  `);

  const insertMessage = db.prepare("INSERT INTO messages (id, group_id, role, content, timestamp) VALUES (?, ?, ?, ?, ?)");
  const selectMessages = db.prepare("SELECT id, role, content, timestamp FROM messages WHERE group_id = ? ORDER BY timestamp DESC LIMIT ?");
  const insertMemory = db.prepare("INSERT INTO memories (id, group_id, content, metadata, created_at, last_accessed_at, access_count) VALUES (?, ?, ?, ?, ?, ?, 0)");
  const selectMemories = db.prepare("SELECT id, content, metadata, last_accessed_at FROM memories WHERE group_id = ? ORDER BY last_accessed_at DESC LIMIT ?");
  const updateMemoryAccess = db.prepare("UPDATE memories SET last_accessed_at = ?, access_count = access_count + 1 WHERE id = ?");
  const deleteMemoryStmt = db.prepare("DELETE FROM memories WHERE id = ?");
  const countMemories = db.prepare("SELECT COUNT(*) as count FROM memories WHERE group_id = ?");
  const pruneOldest = db.prepare("DELETE FROM memories WHERE id IN (SELECT id FROM memories WHERE group_id = ? ORDER BY last_accessed_at ASC LIMIT ?)");

  return {
    saveMessage(groupId, message) {
      const id = randomUUID();
      insertMessage.run(id, groupId, message.role, message.content, Date.now());
      return id;
    },
    getRecentMessages(groupId, limit) {
      const rows = selectMessages.all(groupId, limit) as Array<{ id: string; role: string; content: string; timestamp: number }>;
      return rows.reverse();
    },
    saveMemory(groupId, content, metadata) {
      const id = randomUUID();
      const now = Date.now();
      insertMemory.run(id, groupId, content, metadata ? JSON.stringify(metadata) : null, now, now);
      return id;
    },
    getMemories(groupId, limit) {
      const rows = selectMemories.all(groupId, limit) as Array<{ id: string; content: string; metadata: string | null; last_accessed_at: number }>;
      const now = Date.now();
      for (const row of rows) {
        updateMemoryAccess.run(now, row.id);
      }
      return rows.map(r => ({
        id: r.id,
        content: r.content,
        metadata: r.metadata ? JSON.parse(r.metadata) as Record<string, unknown> : undefined,
        lastAccessedAt: r.last_accessed_at,
      }));
    },
    deleteMemory(id) {
      deleteMemoryStmt.run(id);
    },
    pruneMemories(groupId, maxEntries) {
      const { count } = countMemories.get(groupId) as { count: number };
      if (count <= maxEntries) return 0;
      const toDelete = count - maxEntries;
      const result = pruneOldest.run(groupId, toDelete);
      return result.changes;
    },
    close() {
      db.close();
    },
  };
}
