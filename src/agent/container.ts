/**
 * Container lifecycle management for Agent isolation.
 * Supports process, Docker, and Apple Container isolation levels.
 */

import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export type IsolationLevel = "process" | "docker" | "apple-container";

export interface ContainerOptions {
  isolation: IsolationLevel;
  maxMemory: number; // MB
  idleTimeout: number; // seconds
  image?: string; // Docker image, default "jalenclaw-agent"
}

export interface AgentContainer {
  id: string;
  status: "creating" | "running" | "idle" | "destroying" | "destroyed";
  isolation: IsolationLevel;
  createdAt: number;
  lastActiveAt: number;
}

interface TrackedContainer extends AgentContainer {
  options: ContainerOptions;
}

export interface ContainerManager {
  create(groupId: string, options: ContainerOptions): Promise<AgentContainer>;
  destroy(groupId: string): Promise<void>;
  get(groupId: string): AgentContainer | undefined;
  getAll(): AgentContainer[];
  destroyIdle(): Promise<number>;
  markActive(groupId: string): void;
}

function toPublic(c: TrackedContainer): AgentContainer {
  return {
    id: c.id,
    status: c.status,
    isolation: c.isolation,
    createdAt: c.createdAt,
    lastActiveAt: c.lastActiveAt,
  };
}

export function createContainerManager(): ContainerManager {
  const containers = new Map<string, TrackedContainer>();

  async function createProcess(
    groupId: string,
    options: ContainerOptions,
  ): Promise<TrackedContainer> {
    const now = Date.now();
    const container: TrackedContainer = {
      id: randomUUID(),
      status: "running",
      isolation: "process",
      createdAt: now,
      lastActiveAt: now,
      options,
    };
    containers.set(groupId, container);
    return container;
  }

  async function createDocker(
    groupId: string,
    options: ContainerOptions,
  ): Promise<TrackedContainer> {
    const image = options.image ?? "jalenclaw-agent";
    const containerId = randomUUID();
    const now = Date.now();

    const container: TrackedContainer = {
      id: containerId,
      status: "creating",
      isolation: "docker",
      createdAt: now,
      lastActiveAt: now,
      options,
    };
    containers.set(groupId, container);

    try {
      await execFileAsync("docker", [
        "run",
        "-d",
        "--name",
        `jalenclaw-${containerId}`,
        "--memory",
        `${options.maxMemory}m`,
        image,
      ]);
      container.status = "running";
    } catch (err) {
      containers.delete(groupId);
      throw new Error(
        `Failed to create Docker container for group ${groupId}: ${err}`,
      );
    }

    return container;
  }

  async function destroyDocker(container: TrackedContainer): Promise<void> {
    container.status = "destroying";
    try {
      await execFileAsync("docker", [
        "stop",
        `jalenclaw-${container.id}`,
      ]);
      await execFileAsync("docker", [
        "rm",
        `jalenclaw-${container.id}`,
      ]);
    } catch {
      // Best-effort cleanup; container may already be gone
    }
    container.status = "destroyed";
  }

  return {
    async create(
      groupId: string,
      options: ContainerOptions,
    ): Promise<AgentContainer> {
      if (containers.has(groupId)) {
        throw new Error(
          `Container for group "${groupId}" already exists`,
        );
      }

      let tracked: TrackedContainer;

      switch (options.isolation) {
        case "process":
          tracked = await createProcess(groupId, options);
          break;

        case "docker":
          tracked = await createDocker(groupId, options);
          break;

        case "apple-container":
          // Not implemented yet — fallback to process isolation
          console.warn(
            `apple-container isolation not implemented, falling back to process for group "${groupId}"`,
          );
          tracked = await createProcess(groupId, {
            ...options,
            isolation: "process",
          });
          break;
      }

      return toPublic(tracked);
    },

    async destroy(groupId: string): Promise<void> {
      const container = containers.get(groupId);
      if (!container) return;

      if (container.isolation === "docker") {
        await destroyDocker(container);
      } else {
        container.status = "destroyed";
      }

      containers.delete(groupId);
    },

    get(groupId: string): AgentContainer | undefined {
      const c = containers.get(groupId);
      return c ? toPublic(c) : undefined;
    },

    getAll(): AgentContainer[] {
      return Array.from(containers.values()).map(toPublic);
    },

    async destroyIdle(): Promise<number> {
      const now = Date.now();
      let count = 0;

      for (const [groupId, container] of containers) {
        const idleMs = now - container.lastActiveAt;
        const timeoutMs = container.options.idleTimeout * 1000;

        if (idleMs > timeoutMs) {
          if (container.isolation === "docker") {
            await destroyDocker(container);
          } else {
            container.status = "destroyed";
          }
          containers.delete(groupId);
          count++;
        }
      }

      return count;
    },

    markActive(groupId: string): void {
      const container = containers.get(groupId);
      if (!container) return;
      container.lastActiveAt = Date.now();
    },
  };
}
