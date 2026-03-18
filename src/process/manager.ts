// src/process/manager.ts
import { fork, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";

export interface ManagedProcess {
  id: string;
  service: string;
  status: "starting" | "running" | "stopping" | "stopped" | "crashed";
  pid?: number;
  memoryUsage?: number;
  restartCount: number;
}

export interface ProcessManagerOptions {
  maxRestarts?: number;
  gracefulTimeoutMs?: number;
}

export interface ProcessManager {
  start(service: string, scriptPath: string, args?: string[]): Promise<ManagedProcess>;
  stop(id: string): Promise<void>;
  stopAll(): Promise<void>;
  getStatus(id: string): ManagedProcess | undefined;
  getAllStatus(): ManagedProcess[];
  onStatusChange(handler: (process: ManagedProcess) => void): void;
}

interface InternalProcess {
  managed: ManagedProcess;
  child: ChildProcess | null;
  scriptPath: string;
  args: string[];
  startedAt: number;
  stopping: boolean;
}

const DEFAULT_MAX_RESTARTS = 5;
const DEFAULT_GRACEFUL_TIMEOUT_MS = 5000;
const BASE_BACKOFF_MS = 200;

export function createProcessManager(options?: ProcessManagerOptions): ProcessManager {
  const maxRestarts = options?.maxRestarts ?? DEFAULT_MAX_RESTARTS;
  const gracefulTimeoutMs = options?.gracefulTimeoutMs ?? DEFAULT_GRACEFUL_TIMEOUT_MS;

  const processes = new Map<string, InternalProcess>();
  const statusHandlers: ((process: ManagedProcess) => void)[] = [];

  function notifyStatusChange(managed: ManagedProcess): void {
    for (const handler of statusHandlers) {
      handler({ ...managed });
    }
  }

  function updateStatus(internal: InternalProcess, status: ManagedProcess["status"]): void {
    internal.managed.status = status;
    notifyStatusChange(internal.managed);
  }

  function spawnChild(internal: InternalProcess): ChildProcess {
    const child = fork(internal.scriptPath, internal.args, {
      stdio: ["pipe", "pipe", "pipe", "ipc"],
    });

    internal.child = child;
    internal.managed.pid = child.pid;

    child.on("exit", () => {
      if (internal.stopping) {
        updateStatus(internal, "stopped");
        return;
      }

      // Unexpected exit — attempt restart
      if (internal.managed.restartCount < maxRestarts) {
        updateStatus(internal, "crashed");
        const backoffMs = BASE_BACKOFF_MS * Math.pow(2, internal.managed.restartCount);
        internal.managed.restartCount++;

        setTimeout(() => {
          // Check we haven't been stopped in the meantime
          if (internal.stopping) return;
          updateStatus(internal, "starting");
          const newChild = spawnChild(internal);
          setupReadyListener(internal, newChild);
        }, backoffMs);
      } else {
        updateStatus(internal, "crashed");
      }
    });

    return child;
  }

  function setupReadyListener(internal: InternalProcess, child: ChildProcess): void {
    const onMessage = (msg: unknown): void => {
      if (msg === "ready") {
        child.removeListener("message", onMessage);
        updateStatus(internal, "running");
      }
    };
    child.on("message", onMessage);
  }

  async function startProcess(
    service: string,
    scriptPath: string,
    args: string[] = [],
  ): Promise<ManagedProcess> {
    const id = randomUUID();
    const managed: ManagedProcess = {
      id,
      service,
      status: "starting",
      restartCount: 0,
    };

    const internal: InternalProcess = {
      managed,
      child: null,
      scriptPath,
      args,
      startedAt: Date.now(),
      stopping: false,
    };

    processes.set(id, internal);
    notifyStatusChange(managed);

    const child = spawnChild(internal);

    // Wait for "ready" IPC message or a short timeout
    await new Promise<void>((resolve) => {
      const timeout = setTimeout(() => {
        // If no ready message, consider it running anyway
        if (managed.status === "starting") {
          updateStatus(internal, "running");
        }
        resolve();
      }, 3000);

      const onMessage = (msg: unknown): void => {
        if (msg === "ready") {
          child.removeListener("message", onMessage);
          clearTimeout(timeout);
          updateStatus(internal, "running");
          resolve();
        }
      };
      child.on("message", onMessage);
    });

    return { ...managed };
  }

  async function stopProcess(id: string): Promise<void> {
    const internal = processes.get(id);
    if (!internal) return;
    if (internal.managed.status === "stopped" || internal.managed.status === "stopping") return;

    internal.stopping = true;

    // If process already crashed or has no living child, just mark stopped
    const child = internal.child;
    if (!child || internal.managed.status === "crashed" || child.exitCode !== null) {
      updateStatus(internal, "stopped");
      return;
    }

    updateStatus(internal, "stopping");

    await new Promise<void>((resolve) => {
      const killTimeout = setTimeout(() => {
        try {
          child.kill("SIGKILL");
        } catch {
          // Process may already be gone
        }
      }, gracefulTimeoutMs);

      child.on("exit", () => {
        clearTimeout(killTimeout);
        updateStatus(internal, "stopped");
        resolve();
      });

      try {
        child.kill("SIGTERM");
      } catch {
        // Process may already be gone
        clearTimeout(killTimeout);
        updateStatus(internal, "stopped");
        resolve();
      }
    });
  }

  async function stopAll(): Promise<void> {
    const ids = [...processes.keys()];
    await Promise.all(ids.map((id) => stopProcess(id)));
  }

  function getStatus(id: string): ManagedProcess | undefined {
    const internal = processes.get(id);
    if (!internal) return undefined;
    return { ...internal.managed };
  }

  function getAllStatus(): ManagedProcess[] {
    return [...processes.values()].map((p) => ({ ...p.managed }));
  }

  function onStatusChange(handler: (process: ManagedProcess) => void): void {
    statusHandlers.push(handler);
  }

  return {
    start: startProcess,
    stop: stopProcess,
    stopAll,
    getStatus,
    getAllStatus,
    onStatusChange,
  };
}
