// src/cli/auth.ts
import type { Command } from "commander";
import {
  readTokens,
  writeTokens,
  deleteTokens,
  type OAuthCredentials,
} from "../auth/token-store.js";
import { startCallbackServer, parseCallbackUrl } from "../auth/oauth-server.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { createInterface } from "node:readline";

// --- OAuth V2 Constants (from Pi-AI SDK reverse-engineering) ---

const CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const AUTHORIZE_URL = "https://claude.ai/oauth/authorize";
const TOKEN_URL = "https://platform.claude.com/v1/oauth/token";
const CALLBACK_PORT = 53692;
const REDIRECT_URI = `http://localhost:${CALLBACK_PORT}/callback`;
const SCOPES =
  "org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload";

const DEFAULT_TOKEN_PATH = join(
  homedir(),
  ".jalenclaw",
  "auth",
  "oauth-credentials.json",
);

// Claude Code CLI credentials paths (fallback)
const CLAUDE_CLI_CREDENTIALS_PATH = join(homedir(), ".claude", ".credentials.json");
const CLAUDE_CLI_KEYCHAIN_SERVICE = "Claude Code-credentials";

// --- PKCE helpers ---

export function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = randomBytes(32).toString("base64url");
  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");
  return { codeVerifier, codeChallenge };
}

export function buildAuthorizeUrl(codeVerifier: string, codeChallenge: string): string {
  const params = new URLSearchParams({
    code: "true",
    client_id: CLIENT_ID,
    response_type: "code",
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    code_challenge: codeChallenge,
    code_challenge_method: "S256",
    state: codeVerifier,
  });
  return `${AUTHORIZE_URL}?${params.toString()}`;
}

// --- Exported business logic functions (testable without commander) ---

export interface FlowResult {
  success: boolean;
  message: string;
}

/**
 * Exchange an authorization code for tokens via JSON POST.
 */
export async function exchangeCodeForTokens(
  code: string,
  codeVerifier: string,
  options?: { tokenUrl?: string },
): Promise<OAuthCredentials> {
  const tokenUrl = options?.tokenUrl ?? TOKEN_URL;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "authorization_code",
      client_id: CLIENT_ID,
      code,
      state: codeVerifier,
      redirect_uri: REDIRECT_URI,
      code_verifier: codeVerifier,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token exchange failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };

  return {
    version: 1,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: (data.scope ?? SCOPES).split(" "),
  };
}

/**
 * Refresh tokens using a refresh_token grant.
 */
export async function refreshTokens(
  refreshToken: string,
  options?: { tokenUrl?: string },
): Promise<OAuthCredentials> {
  const tokenUrl = options?.tokenUrl ?? TOKEN_URL;
  const response = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CLIENT_ID,
      refresh_token: refreshToken,
    }),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Token refresh failed (${response.status}): ${body}`);
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope?: string;
  };

  return {
    version: 1,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: (data.scope ?? SCOPES).split(" "),
  };
}

/**
 * Read Claude Code CLI OAuth credentials from macOS Keychain or file.
 * Used as a FALLBACK when user already has Claude Code logged in.
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
      // Keychain not available or no entry - fall through to file
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
 * Full OAuth login flow:
 * 1. Generate PKCE
 * 2. Start callback server on fixed port 53692
 * 3. Open browser
 * 4. Wait for callback OR manual paste
 * 5. Exchange code for tokens
 * 6. Save tokens
 */
export async function oauthLoginFlow(options?: {
  tokenPath?: string;
  openBrowser?: (url: string) => Promise<void>;
  readManualInput?: () => Promise<string | null>;
  tokenUrl?: string;
}): Promise<FlowResult> {
  const tokenPath = options?.tokenPath ?? DEFAULT_TOKEN_PATH;

  // 1. Generate PKCE
  const { codeVerifier, codeChallenge } = generatePkce();
  const authorizeUrl = buildAuthorizeUrl(codeVerifier, codeChallenge);

  // 2. Start callback server on fixed port
  let callbackServer;
  try {
    callbackServer = await startCallbackServer({
      port: CALLBACK_PORT,
      timeoutMs: 10 * 60 * 1000,
    });
  } catch (err) {
    return {
      success: false,
      message: `Failed to start callback server on port ${CALLBACK_PORT}: ${(err as Error).message}`,
    };
  }

  try {
    // 3. Open browser
    console.log("\nOpening browser for authentication...");
    console.log("If the browser doesn't open, visit this URL:");
    console.log(`  ${authorizeUrl}\n`);

    if (options?.openBrowser) {
      await options.openBrowser(authorizeUrl);
    } else {
      try {
        const { exec } = await import("node:child_process");
        const openCmd =
          process.platform === "darwin"
            ? "open"
            : process.platform === "win32"
              ? "start"
              : "xdg-open";
        exec(`${openCmd} "${authorizeUrl}"`);
      } catch {
        // Browser open failed silently - user has the URL printed above
      }
    }

    console.log(`Waiting for callback on port ${CALLBACK_PORT}...`);
    console.log("(Or paste the authorization code/URL here)");

    // 4. Race: callback server vs manual paste
    let code: string;

    if (options?.readManualInput) {
      // Test mode: use provided input reader
      const manualResult = await Promise.race([
        callbackServer.waitForCode().then((r) => ({ source: "callback" as const, code: r.code })),
        options.readManualInput().then((input) => ({ source: "manual" as const, code: input })),
      ]);

      if (!manualResult.code) {
        return { success: false, message: "No authorization code received." };
      }

      code = extractCodeFromInput(manualResult.code);
    } else {
      // Real mode: race callback vs stdin
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const manualPromise = new Promise<string>((resolve) => {
        rl.question("> ", (answer) => resolve(answer));
      });

      const callbackPromise = callbackServer
        .waitForCode()
        .then((r) => ({ source: "callback" as const, code: r.code }));
      const manualInputPromise = manualPromise.then((input) => ({
        source: "manual" as const,
        code: input,
      }));

      const result = await Promise.race([callbackPromise, manualInputPromise]);

      // Close readline immediately so Node can continue
      rl.close();

      if (!result.code) {
        return { success: false, message: "No authorization code received." };
      }

      code = extractCodeFromInput(result.code);
      console.log(`\nReceived authorization code (via ${result.source}).`);
    }

    // 5. Exchange code for tokens
    const tokens = await exchangeCodeForTokens(code, codeVerifier, {
      tokenUrl: options?.tokenUrl,
    });

    // 6. Save tokens
    await writeTokens(tokenPath, tokens);

    const expiresDate = new Date(tokens.expiresAt).toISOString();
    return {
      success: true,
      message: `Logged in successfully! Token expires at ${expiresDate}`,
    };
  } finally {
    await callbackServer.close();
  }
}

/**
 * Extract authorization code from user input (could be a full URL or just the code).
 */
function extractCodeFromInput(input: string): string {
  const trimmed = input.trim();

  // If it looks like a URL, parse the code from it
  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    const result = parseCallbackUrl(trimmed);
    return result.code;
  }

  // Otherwise treat as raw code
  return trimmed;
}

// readStdinInput removed — readline is now created inline in oauthLoginFlow
// to allow proper cleanup after Promise.race resolves.

/**
 * Import Claude Code CLI credentials as a FALLBACK.
 */
export async function importClaudeCliFlow(options?: {
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
        "Imported Claude Code credentials (token expired - it will be refreshed on first use).",
    };
  }

  const expiresDate = new Date(creds.expiresAt).toLocaleString();
  return {
    success: true,
    message: `Successfully imported Claude Code credentials. Token expires at ${expiresDate}.`,
  };
}

/**
 * Primary login flow: OAuth first, with Claude Code CLI import as fallback.
 */
export async function loginFlow(options?: {
  tokenPath?: string;
  credentialsPath?: string;
  skipKeychain?: boolean;
  openBrowser?: (url: string) => Promise<void>;
  readManualInput?: () => Promise<string | null>;
  tokenUrl?: string;
  useOAuth?: boolean;
}): Promise<FlowResult> {
  // If explicitly using OAuth or no option specified, try OAuth flow
  if (options?.useOAuth !== false) {
    return oauthLoginFlow({
      tokenPath: options?.tokenPath,
      openBrowser: options?.openBrowser,
      readManualInput: options?.readManualInput,
      tokenUrl: options?.tokenUrl,
    });
  }

  // Fallback: import from Claude Code CLI
  return importClaudeCliFlow({
    tokenPath: options?.tokenPath,
    credentialsPath: options?.credentialsPath,
    skipKeychain: options?.skipKeychain,
  });
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
  tokenSource?: "oauth" | "claude-code-import";
  refreshAvailable?: boolean;
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

  // Determine token source: own OAuth tokens have full scopes, imported have fewer
  const hasFullScopes = tokens.scopes.length > 2;
  const tokenSource = hasFullScopes ? "oauth" : "claude-code-import";
  const refreshAvailable = tokens.refreshToken.length > 0;

  return {
    authenticated: true,
    message: expired
      ? `Authenticated (token expired at ${expiresDate}). Will refresh on next use.`
      : `Authenticated. Token expires at ${expiresDate}.`,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    expired,
    tokenSource,
    refreshAvailable,
  };
}

export async function refreshFlow(options?: {
  tokenPath?: string;
  tokenUrl?: string;
}): Promise<FlowResult> {
  const tokenPath = options?.tokenPath ?? DEFAULT_TOKEN_PATH;
  const tokens = await readTokens(tokenPath);

  if (tokens?.refreshToken) {
    // Try native refresh first
    try {
      const newTokens = await refreshTokens(tokens.refreshToken, {
        tokenUrl: options?.tokenUrl,
      });
      await writeTokens(tokenPath, newTokens);
      const expiresDate = new Date(newTokens.expiresAt).toISOString();
      return {
        success: true,
        message: `Token refreshed. New expiry: ${expiresDate}`,
      };
    } catch {
      // Fall through to Claude Code CLI import
    }
  }

  // Fallback: re-import from Claude Code CLI
  const result = await importClaudeCliFlow({ tokenPath });
  if (result.success) {
    return { success: true, message: "Token refreshed from Claude Code credentials." };
  }
  return {
    success: false,
    message: "No refresh token available and no Claude Code credentials found.",
  };
}

// --- Commander registration ---

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Manage OAuth authentication");

  auth
    .command("login")
    .description("Log in via OAuth (or import from Claude Code CLI)")
    .option("--import", "Import credentials from Claude Code CLI instead of OAuth")
    .action(async (opts: { import?: boolean }) => {
      if (opts.import) {
        const result = await importClaudeCliFlow();
        console.log(result.message);
        process.exitCode = result.success ? 0 : 1;
      } else {
        console.log("\x1b[1m\uD83D\uDD10 Starting Claude OAuth login...\x1b[0m");
        const result = await loginFlow();
        console.log(result.message);
        process.exitCode = result.success ? 0 : 1;
      }
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
      if (result.tokenSource) {
        console.log(`Token source: ${result.tokenSource}`);
      }
      if (result.scopes) {
        console.log(`Scopes: ${result.scopes.join(", ")}`);
      }
      if (result.refreshAvailable !== undefined) {
        console.log(`Refresh available: ${result.refreshAvailable ? "yes" : "no"}`);
      }
      process.exitCode = result.authenticated ? 0 : 1;
    });

  auth
    .command("refresh")
    .description("Refresh OAuth token")
    .action(async () => {
      const result = await refreshFlow();
      console.log(result.message);
      process.exitCode = result.success ? 0 : 1;
    });
}
