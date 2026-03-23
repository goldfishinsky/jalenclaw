// src/cli/auth.ts
import type { Command } from "commander";
import {
  readTokens,
  writeTokens,
  deleteTokens,
  type OAuthCredentials,
} from "../auth/token-store.js";
// oauth-server.ts still available for future use but login now uses paste-code flow
import { generatePKCE } from "../auth/pkce.js";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { execSync } from "node:child_process";

const DEFAULT_TOKEN_PATH = join(
  homedir(),
  ".jalenclaw",
  "auth",
  "oauth-credentials.json",
);
const AUTHORIZATION_ENDPOINT =
  "https://console.anthropic.com/oauth/authorize";
const TOKEN_ENDPOINT = "https://console.anthropic.com/oauth/token";
const DEFAULT_CLIENT_ID = "9d1c250a-e61b-44d9-88ed-5944d1962f5e";
const REDIRECT_URI = "https://console.anthropic.com/oauth/code/callback";
const SCOPES = "org:create_api_key user:profile user:inference";

// --- Exported business logic functions (testable without commander) ---

export interface BuildAuthUrlParams {
  clientId: string;
  redirectUri: string;
  codeChallenge: string;
  challengeMethod: string;
  scopes: string;
  state: string;
}

export function buildAuthorizationUrl(params: BuildAuthUrlParams): string {
  const url = new URL(AUTHORIZATION_ENDPOINT);
  url.searchParams.set("code", "true");
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", params.clientId);
  url.searchParams.set("redirect_uri", params.redirectUri);
  url.searchParams.set("code_challenge", params.codeChallenge);
  url.searchParams.set("code_challenge_method", params.challengeMethod);
  url.searchParams.set("scope", params.scopes);
  url.searchParams.set("state", params.state);
  return url.toString();
}

export interface LoginFlowParams {
  tokenPath: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  clientId: string;
  fetchFn?: typeof globalThis.fetch;
}

export interface FlowResult {
  success: boolean;
  message: string;
}

export async function loginFlow(params: LoginFlowParams): Promise<FlowResult> {
  const fetchFn = params.fetchFn ?? globalThis.fetch;

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code: params.code,
    code_verifier: params.codeVerifier,
    redirect_uri: params.redirectUri,
    client_id: params.clientId,
  });

  const response = await fetchFn(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    console.error(`\nToken exchange failed (HTTP ${response.status}):`);
    console.error(text);
    return { success: false, message: `Token exchange failed (${response.status}): ${text}` };
  }

  const responseText = await response.text();
  let data: { access_token: string; refresh_token: string; expires_in: number; scope: string };
  try {
    data = JSON.parse(responseText);
  } catch {
    console.error("\nFailed to parse token response:", responseText);
    return { success: false, message: `Invalid token response: ${responseText}` };
  }

  const tokens: OAuthCredentials = {
    version: 1,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: data.scope.split(" "),
  };

  await writeTokens(params.tokenPath, tokens);

  return { success: true, message: "Successfully logged in." };
}

export interface LogoutFlowParams {
  tokenPath: string;
}

export async function logoutFlow(
  params: LogoutFlowParams,
): Promise<FlowResult> {
  await deleteTokens(params.tokenPath);
  return { success: true, message: "Logged out. OAuth tokens cleared." };
}

export interface StatusFlowResult {
  authenticated: boolean;
  message: string;
  expiresAt?: number;
  scopes?: string[];
  expired?: boolean;
}

export interface StatusFlowParams {
  tokenPath: string;
}

export async function statusFlow(
  params: StatusFlowParams,
): Promise<StatusFlowResult> {
  const tokens = await readTokens(params.tokenPath);

  if (!tokens) {
    return { authenticated: false, message: "Not authenticated." };
  }

  const expired = tokens.expiresAt < Date.now();
  const expiresDate = new Date(tokens.expiresAt).toISOString();

  return {
    authenticated: true,
    message: expired
      ? `Authenticated (token expired at ${expiresDate}). Run 'jalenclaw auth refresh' to renew.`
      : `Authenticated. Token expires at ${expiresDate}.`,
    expiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
    expired,
  };
}

export interface RefreshFlowParams {
  tokenPath: string;
  clientId: string;
  fetchFn?: typeof globalThis.fetch;
}

export async function refreshFlow(
  params: RefreshFlowParams,
): Promise<FlowResult> {
  const tokens = await readTokens(params.tokenPath);
  if (!tokens) {
    return {
      success: false,
      message: "No stored token found. Run 'jalenclaw auth login' first.",
    };
  }

  const fetchFn = params.fetchFn ?? globalThis.fetch;

  const body = new URLSearchParams({
    grant_type: "refresh_token",
    refresh_token: tokens.refreshToken,
    client_id: params.clientId,
  });

  const response = await fetchFn(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: body.toString(),
  });

  if (!response.ok) {
    const text = await response.text().catch(() => "unknown error");
    return { success: false, message: `Token refresh failed: ${text}` };
  }

  const data = (await response.json()) as {
    access_token: string;
    refresh_token: string;
    expires_in: number;
    scope: string;
  };

  const updated: OAuthCredentials = {
    version: 1,
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + data.expires_in * 1000,
    scopes: data.scope.split(" "),
  };

  await writeTokens(params.tokenPath, updated);

  return { success: true, message: "Token refreshed successfully." };
}

function openBrowser(url: string): void {
  const platform = process.platform;
  try {
    if (platform === "darwin") {
      execSync(`open ${JSON.stringify(url)}`, { stdio: "ignore" });
    } else {
      execSync(`xdg-open ${JSON.stringify(url)}`, { stdio: "ignore" });
    }
  } catch {
    // Browser open failed — user will need to copy the URL manually
  }
}

// --- Commander registration ---

export function registerAuthCommands(program: Command): void {
  const auth = program
    .command("auth")
    .description("Manage OAuth authentication");

  auth
    .command("login")
    .description("Login with Claude subscription")
    .action(async () => {
      const pkce = generatePKCE();
      const state = randomBytes(16).toString("hex");

      const authUrl = buildAuthorizationUrl({
        clientId: DEFAULT_CLIENT_ID,
        redirectUri: REDIRECT_URI,
        codeChallenge: pkce.codeChallenge,
        challengeMethod: pkce.challengeMethod,
        scopes: SCOPES,
        state,
      });

      console.log("\nOpening browser for authorization...");
      openBrowser(authUrl);
      console.log(
        "\nIf the browser doesn't open, visit this URL:\n",
      );
      console.log(`  ${authUrl}\n`);
      console.log(
        "After authorizing, you'll see a code on the page. Paste it here:\n",
      );

      const readline = await import("node:readline");
      const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
      });

      const code = await new Promise<string>((resolve) => {
        rl.question("> ", (answer) => {
          rl.close();
          resolve(answer.trim());
        });
      });

      if (!code) {
        console.log("No code provided. Login cancelled.");
        process.exitCode = 1;
        return;
      }

      const result = await loginFlow({
        tokenPath: DEFAULT_TOKEN_PATH,
        code,
        codeVerifier: pkce.codeVerifier,
        redirectUri: REDIRECT_URI,
        clientId: DEFAULT_CLIENT_ID,
      });

      console.log(result.message);
      process.exitCode = result.success ? 0 : 1;
    });

  auth
    .command("logout")
    .description("Clear stored OAuth tokens")
    .action(async () => {
      const result = await logoutFlow({ tokenPath: DEFAULT_TOKEN_PATH });
      console.log(result.message);
    });

  auth
    .command("status")
    .description("Show authentication status")
    .action(async () => {
      const result = await statusFlow({ tokenPath: DEFAULT_TOKEN_PATH });
      console.log(result.message);
      if (result.scopes) {
        console.log(`Scopes: ${result.scopes.join(", ")}`);
      }
      process.exitCode = result.authenticated ? 0 : 1;
    });

  auth
    .command("refresh")
    .description("Manually refresh OAuth token")
    .action(async () => {
      const result = await refreshFlow({
        tokenPath: DEFAULT_TOKEN_PATH,
        clientId: DEFAULT_CLIENT_ID,
      });
      console.log(result.message);
      process.exitCode = result.success ? 0 : 1;
    });
}
