import type { StorageAdapter } from "./sqlite.js";

export interface MemoryManager {
  addMessage(groupId: string, role: string, content: string): void;
  getContext(groupId: string, maxMessages?: number): Array<{ role: string; content: string }>;
  remember(groupId: string, content: string, metadata?: Record<string, unknown>): void;
  recall(groupId: string, limit?: number): Array<{ id: string; content: string; metadata?: Record<string, unknown> }>;
  forget(groupId: string, memoryId: string): void;
  close(): void;
}

export interface MemoryManagerOptions {
  storage: StorageAdapter;
  maxShortTermMessages?: number;
  maxLongTermMemories?: number;
}

export function createMemoryManager(options: MemoryManagerOptions): MemoryManager {
  const { storage, maxShortTermMessages = 20, maxLongTermMemories = 10000 } = options;

  return {
    addMessage(groupId, role, content) {
      storage.saveMessage(groupId, { role, content });
    },
    getContext(groupId, maxMessages) {
      return storage.getRecentMessages(groupId, maxMessages ?? maxShortTermMessages)
        .map(m => ({ role: m.role, content: m.content }));
    },
    remember(groupId, content, metadata) {
      storage.saveMemory(groupId, content, metadata);
      storage.pruneMemories(groupId, maxLongTermMemories);
    },
    recall(groupId, limit) {
      return storage.getMemories(groupId, limit ?? 10)
        .map(m => ({ id: m.id, content: m.content, metadata: m.metadata }));
    },
    forget(_groupId, memoryId) {
      storage.deleteMemory(memoryId);
    },
    close() {
      storage.close();
    },
  };
}
