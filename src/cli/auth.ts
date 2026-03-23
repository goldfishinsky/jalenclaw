// src/cli/auth.ts
import type { Command } from "commander";
import {
  readTokens,
  writeTokens,
  deleteTokens,
  type OAuthCredentials,
} from "../auth/token-store.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

const DEFAULT_TOKEN_PATH = join(
  homedir(),
  ".jalenclaw",
  "auth",
  "oauth-credentials.json",
);

// Claude Code CLI credentials paths
const CLAUDE_CLI_CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CLAUDE_CLI_KEYCHAIN_SERVICE = "Claude Code-credentials";

// --- Exported business logic functions (testable without commander) ---

export interface FlowResult {
  success: boolean;
  message: string;
}

/**
 * Read Claude Code CLI OAuth credentials from macOS Keychain or file.
 * This is how OpenClaw does it — reuse Claude Code's existing login.
 */
export function readClaudeCliCredentials(options?: {
  homeDir?: string;
  credentialsPath?: string;
  skipKeychain?: boolean;
}): OAuthCredentials | null {
  // 1. Try macOS Keychain first
  if (process.platform === "darwin" && !options?.skipKeychain) {
    try {
      const result = execSync(
        `security find-generic-password -s "${CLAUDE_CLI_KEYCHAIN_SERVICE}" -w`,
        { encoding: "utf8", timeout: 5000, stdio: ["pipe", "pipe", "pipe"] },
      );
      const data = JSON.parse(result.trim());
      const creds = parseClaudeCliOAuth(data?.claudeAiOauth);
      if (creds) return creds;
    } catch {
      // Keychain not available or no entry — fall through to file
    }
  }

  // 2. Fall back to file
  const credPath = options?.credentialsPath ?? CLAUDE_CLI_CREDENTIALS_PATH;
  try {
    const raw = readFileSync(credPath, "utf-8");
    const data = JSON.parse(raw);
    return parseClaudeCliOAuth(data?.claudeAiOauth);
  } catch {
    return null;
  }
}

function parseClaudeCliOAuth(claudeOauth: unknown): OAuthCredentials | null {
  if (!claudeOauth || typeof claudeOauth !== "object") return null;

  const obj = claudeOauth as Record<string, unknown>;
  const accessToken = obj.accessToken;
  const refreshToken = obj.refreshToken;
  const expiresAt = obj.expiresAt;

  if (typeof accessToken !== "string" || !accessToken) return null;
  if (typeof expiresAt !== "number" || !Number.isFinite(expiresAt)) return null;

  return {
    version: 1,
    accessToken,
    refreshToken: typeof refreshToken === "string" ? refreshToken : "",
    expiresAt,
    scopes: ["user:inference", "user:profile"],
  };
}

/**
 * Import Claude Code CLI credentials into JalenClaw's token store.
 */
export async function loginFlow(options?: {
  tokenPath?: string;
  credentialsPath?: string;
  skipKeychain?: boolean;
}): Promise<FlowResult> {
  const tokenPath = options?.tokenPath ?? DEFAULT_TOKEN_PATH;
  const creds = readClaudeCliCredentials({
    credentialsPath: options?.credentialsPath,
    skipKeychain: options?.skipKeychain,
  });

  if (!creds) {
    return {
      success: false,
      message:
        "No Claude Code credentials found. Please log in to Claude Code first:\n" +
        "  1. Install Claude Code: npm install -g @anthropic-ai/claude-code\n" +
        "  2. Run: claude\n" +
        "  3. Complete the login in browser\n" +
        "  4. Then run: jalenclaw auth login",
    };
  }

  await writeTokens(tokenPath, creds);

  const expired = creds.expiresAt < Date.now();
  if (expired) {
    return {
      success: true,
      message:
        "Imported Claude Code credentials (token expired — it will be refreshed on first use).",
    };
  }

  const expiresDate = new Date(creds.expiresAt).toLocaleString();
  return {
    success: true,
    message: `Successfully imported Claude Code credentials. Token expires at ${expiresDate}.`,
  };
}

export interface LogoutFlowParams {
  tokenPath?: string;
}

export async function logoutFlow(
  params?: LogoutFlowParams,
): Promise<FlowResult> {
  await deleteTokens(params?.tokenPath ?? DEFAULT_TOKEN_PATH);
  return { success: true, message: "Logged out. OAuth tokens cleared." };
}

export interface StatusFlowResult {
  authenticated: boolean;
  message: string;
  expiresAt?: number;
  scopes?: string[];
  expired?: boolean;
}

export async function statusFlow(options?: {
  tokenPath?: string;
}): Promise<StatusFlowResult> {
  const tokenPath = options?.tokenPath ?? DEFAULT_TOKEN_PATH;
  const tokens = await readTokens(tokenPath);

  if (!tokens) {
    // Also check Claude Code CLI directly
    const cliCreds = readClaudeCliCredentials();
    if (cliCreds) {
      return {
        authenticated: false,
        message:
          "Not imported yet, but Claude Code credentials found. Run 'jalenclaw auth login' to import.",
      };
    }
    return { authenticated: false, message: "Not authenticated." };
  }

  const expired = tokens.expiresAt < Date.now();
  const expiresDate = new Date(tokens.expiresAt).toISOString();

  return {
    authenticated: true,
    message: expired
      ? `Authenticated (token expired at ${expiresDate}). Will refresh on next use.`
      : `Authenticated. Token expires at ${expiresDate}.`,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    expired,
  };
}

export async function refreshFlow(options?: {
  tokenPath?: string;
}): Promise<FlowResult> {
  // Re-import from Claude Code CLI (which may have refreshed the token)
  const result = await loginFlow({ tokenPath: options?.tokenPath });
  if (result.success) {
    return { success: true, message: "Token refreshed from Claude Code credentials." };
  }
  return result;
}

// --- Commander registration ---

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Manage OAuth authentication");

  auth
    .command("login")
    .description("Import Claude Code subscription credentials")
    .action(async () => {
      const result = await loginFlow();
      console.log(result.message);
      process.exitCode = result.success ? 0 : 1;
    });

  auth
    .command("logout")
    .description("Clear stored OAuth tokens")
    .action(async () => {
      const result = await logoutFlow();
      console.log(result.message);
    });

  auth
    .command("status")
    .description("Show authentication status")
    .action(async () => {
      const result = await statusFlow();
      console.log(result.message);
      if (result.scopes) {
        console.log(`Scopes: ${result.scopes.join(", ")}`);
      }
      process.exitCode = result.authenticated ? 0 : 1;
    });

  auth
    .command("refresh")
    .description("Refresh token from Claude Code credentials")
    .action(async () => {
      const result = await refreshFlow();
      console.log(result.message);
      process.exitCode = result.success ? 0 : 1;
    });
}
