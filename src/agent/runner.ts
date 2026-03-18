/**
 * Agent execution engine.
 * Manages conversation sessions, calls LLM, handles tool responses.
 */

import { randomUUID } from "node:crypto";
import type { LLMProvider, Message } from "../models/interface.js";
import type { MemoryManager } from "../memory/manager.js";
import type { AgentPermissions } from "./permissions.js";

export interface AgentSession {
  id: string;
  groupId: string;
  messages: Message[];
  createdAt: number;
  lastActiveAt: number;
}

export interface AgentRunnerOptions {
  provider: LLMProvider;
  memory: MemoryManager;
  permissions?: AgentPermissions;
  idleTimeoutMs?: number; // default 300_000 (5 min)
}

export interface AgentRunner {
  handleMessage(groupId: string, content: string): AsyncIterable<string>;
  getSession(groupId: string): AgentSession | undefined;
  destroySession(groupId: string): void;
  destroyIdleSessions(): number;
}

export function createAgentRunner(options: AgentRunnerOptions): AgentRunner {
  const { provider, memory, idleTimeoutMs = 300_000 } = options;
  const sessions = new Map<string, AgentSession>();

  function getOrCreateSession(groupId: string): AgentSession {
    let session = sessions.get(groupId);
    if (!session) {
      // Load existing context from memory
      const context = memory.getContext(groupId);
      const messages: Message[] = context.map((m) => ({
        role: m.role as Message["role"],
        content: m.content,
      }));
      session = {
        id: randomUUID(),
        groupId,
        messages,
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      };
      sessions.set(groupId, session);
    }
    return session;
  }

  return {
    async *handleMessage(groupId: string, content: string): AsyncIterable<string> {
      const session = getOrCreateSession(groupId);
      session.lastActiveAt = Date.now();

      const userMessage: Message = { role: "user", content };
      session.messages.push(userMessage);
      memory.addMessage(groupId, "user", content);

      const chunks = provider.chat(session.messages);
      let fullResponse = "";

      for await (const chunk of chunks) {
        if (chunk.type === "text") {
          fullResponse += chunk.content;
          yield chunk.content;
        }
      }

      if (fullResponse.length > 0) {
        const assistantMessage: Message = { role: "assistant", content: fullResponse };
        session.messages.push(assistantMessage);
        memory.addMessage(groupId, "assistant", fullResponse);
      }
    },

    getSession(groupId: string): AgentSession | undefined {
      return sessions.get(groupId);
    },

    destroySession(groupId: string): void {
      sessions.delete(groupId);
    },

    destroyIdleSessions(): number {
      const now = Date.now();
      let count = 0;
      for (const [groupId, session] of sessions) {
        if (now - session.lastActiveAt >= idleTimeoutMs) {
          sessions.delete(groupId);
          count++;
        }
      }
      return count;
    },
  };
}
