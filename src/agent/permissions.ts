/**
 * Sandbox permission model for Agent execution.
 * Controls which commands, paths, and resources an agent session may access.
 */

export interface AgentPermissions {
  allowedCommands: string[];
  blockedPaths: string[];
  networkAccess: boolean;
  maxExecutionTime: number; // seconds
  maxMemory: number; // MB
}

export const DEFAULT_PERMISSIONS: AgentPermissions = {
  allowedCommands: ["ls", "cat", "node"],
  blockedPaths: ["/etc", "/usr", "~/.ssh"],
  networkAccess: false,
  maxExecutionTime: 30,
  maxMemory: 256,
};

/**
 * Check whether a command is allowed under the given permissions.
 * Extracts the base command (first token) and checks against the allowlist.
 */
export function isCommandAllowed(command: string, permissions: AgentPermissions): boolean {
  const trimmed = command.trim();
  if (trimmed.length === 0) return false;
  const base = trimmed.split(/\s+/)[0];
  return permissions.allowedCommands.includes(base);
}

/**
 * Check whether a file path is allowed (not under any blocked path).
 * Normalizes ~ to literal match and checks prefix-based blocking.
 */
export function isPathAllowed(path: string, permissions: AgentPermissions): boolean {
  const normalized = path.trim();
  if (normalized.length === 0) return false;
  for (const blocked of permissions.blockedPaths) {
    if (normalized === blocked || normalized.startsWith(blocked + "/")) {
      return false;
    }
  }
  return true;
}
