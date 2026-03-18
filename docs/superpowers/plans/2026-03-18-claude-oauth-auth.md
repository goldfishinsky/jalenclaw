# Claude OAuth Subscription Authentication — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add OAuth authentication support for Claude Code subscriptions to the Claude LLM provider, alongside existing API Key auth.

**Architecture:** Strategy pattern — `AuthStrategy` interface with two implementations (`ApiKeyStrategy`, `OAuthStrategy`). OAuth flow uses Authorization Code + PKCE. Token stored in local JSON file. Circuit breaker protects against refresh storms. Config uses Zod discriminated union.

**Tech Stack:** TypeScript, Zod (config validation), Node.js `node:http` (callback server), Node.js `node:crypto` (PKCE), Vitest (testing)

**Spec:** `docs/superpowers/specs/2026-03-18-claude-oauth-subscription.md`

---

## File Structure

```
src/
├── auth/
│   ├── strategy.ts        # AuthStrategy interface (already exists)
│   ├── apikey.ts           # ApiKeyStrategy implementation
│   ├── oauth.ts            # OAuthStrategy — refresh logic, circuit breaker, getHeaders
│   ├── token-store.ts      # Read/write/delete oauth-credentials.json
│   ├── oauth-server.ts     # Temporary HTTP callback server + manual mode
│   └── pkce.ts             # PKCE code_verifier/code_challenge generation
├── config/
│   └── schema.ts           # Zod schema with discriminated union for claude provider
tests/
├── unit/
│   ├── auth/
│   │   ├── apikey.test.ts
│   │   ├── token-store.test.ts
│   │   ├── pkce.test.ts
│   │   ├── oauth.test.ts
│   │   └── oauth-server.test.ts
│   └── config/
│       └── schema.test.ts
├── integration/
│   └── auth/
│       └── oauth-flow.test.ts
└── helpers/
    └── index.ts            # (already exists)
```

---

## Chunk 1: Foundation (Tasks 1-3)

### Task 1: Token Store

Responsible for reading, writing, and deleting `oauth-credentials.json`. Pure file I/O, no network.

**Files:**
- Create: `src/auth/token-store.ts`
- Test: `tests/unit/auth/token-store.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/auth/token-store.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { join } from "node:path";
import { stat } from "node:fs/promises";
import { createTempDir } from "../../helpers/index.js";
import {
  readTokens,
  writeTokens,
  deleteTokens,
  type OAuthCredentials,
} from "../../../src/auth/token-store.js";

describe("token-store", () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;
  let tokenPath: string;

  beforeEach(async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
    tokenPath = join(tempDir, "oauth-credentials.json");
  });

  afterEach(async () => {
    await cleanup();
  });

  const validTokens: OAuthCredentials = {
    version: 1,
    accessToken: "sk-ant-oat01-test-access-token",
    refreshToken: "sk-ant-ort01-test-refresh-token",
    expiresAt: Date.now() + 3600_000,
    scopes: ["user:inference", "user:profile"],
  };

  describe("writeTokens", () => {
    it("writes tokens to file", async () => {
      await writeTokens(tokenPath, validTokens);
      const result = await readTokens(tokenPath);
      expect(result).toEqual(validTokens);
    });

    it("sets file permissions to 0600", async () => {
      await writeTokens(tokenPath, validTokens);
      const stats = await stat(tokenPath);
      const mode = stats.mode & 0o777;
      expect(mode).toBe(0o600);
    });

    it("creates parent directories if they don't exist", async () => {
      const nestedPath = join(tempDir, "nested", "dir", "tokens.json");
      await writeTokens(nestedPath, validTokens);
      const result = await readTokens(nestedPath);
      expect(result).toEqual(validTokens);
    });
  });

  describe("readTokens", () => {
    it("returns null when file does not exist", async () => {
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });

    it("returns null when file contains invalid JSON", async () => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(tokenPath, "not json");
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });

    it("returns null when JSON is missing required fields", async () => {
      const { writeFile } = await import("node:fs/promises");
      await writeFile(tokenPath, JSON.stringify({ version: 1 }));
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });
  });

  describe("deleteTokens", () => {
    it("deletes existing token file", async () => {
      await writeTokens(tokenPath, validTokens);
      await deleteTokens(tokenPath);
      const result = await readTokens(tokenPath);
      expect(result).toBeNull();
    });

    it("does not throw when file does not exist", async () => {
      await expect(deleteTokens(tokenPath)).resolves.toBeUndefined();
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/auth/token-store.test.ts`
Expected: FAIL — cannot resolve `../../../src/auth/token-store.js`

- [ ] **Step 3: Write the implementation**

```typescript
// src/auth/token-store.ts
import { readFile, writeFile, unlink, mkdir, chmod } from "node:fs/promises";
import { dirname } from "node:path";
import { z } from "zod";

const oauthCredentialsSchema = z.object({
  version: z.literal(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.number(),
  scopes: z.array(z.string()),
});

export type OAuthCredentials = z.infer<typeof oauthCredentialsSchema>;

export async function readTokens(
  path: string,
): Promise<OAuthCredentials | null> {
  try {
    const raw = await readFile(path, "utf-8");
    const parsed = JSON.parse(raw);
    const result = oauthCredentialsSchema.safeParse(parsed);
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export async function writeTokens(
  path: string,
  tokens: OAuthCredentials,
): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(tokens, null, 2), "utf-8");
  await chmod(path, 0o600);
}

export async function deleteTokens(path: string): Promise<void> {
  try {
    await unlink(path);
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/auth/token-store.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/auth/token-store.ts tests/unit/auth/token-store.test.ts
git commit -m "feat(auth): add token store for OAuth credentials"
```

---

### Task 2: API Key Strategy

Simple `AuthStrategy` implementation that returns `X-Api-Key` header.

**Files:**
- Create: `src/auth/apikey.ts`
- Test: `tests/unit/auth/apikey.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/auth/apikey.test.ts
import { describe, it, expect } from "vitest";
import { ApiKeyStrategy } from "../../../src/auth/apikey.js";

describe("ApiKeyStrategy", () => {
  it("returns X-Api-Key header", async () => {
    const strategy = new ApiKeyStrategy("sk-ant-api03-test-key");
    const headers = await strategy.getHeaders();
    expect(headers).toEqual({ "X-Api-Key": "sk-ant-api03-test-key" });
  });

  it("isValid returns true when key is non-empty", async () => {
    const strategy = new ApiKeyStrategy("sk-ant-api03-test-key");
    expect(await strategy.isValid()).toBe(true);
  });

  it("isValid returns false when key is empty", async () => {
    const strategy = new ApiKeyStrategy("");
    expect(await strategy.isValid()).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/auth/apikey.test.ts`
Expected: FAIL — cannot resolve `../../../src/auth/apikey.js`

- [ ] **Step 3: Write the implementation**

```typescript
// src/auth/apikey.ts
import type { AuthStrategy } from "./strategy.js";

export class ApiKeyStrategy implements AuthStrategy {
  constructor(private readonly apiKey: string) {}

  async getHeaders(): Promise<Record<string, string>> {
    return { "X-Api-Key": this.apiKey };
  }

  async isValid(): Promise<boolean> {
    return this.apiKey.length > 0;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/auth/apikey.test.ts`
Expected: All 3 tests PASS

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/auth/apikey.ts tests/unit/auth/apikey.test.ts
git commit -m "feat(auth): add API key authentication strategy"
```

---

### Task 3: Config Schema

Zod discriminated union for Claude provider config. Validates `authType: "oauth"` vs `"apikey"`.

**Files:**
- Create: `src/config/schema.ts`
- Test: `tests/unit/config/schema.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/config/schema.test.ts
import { describe, it, expect } from "vitest";
import { claudeProviderConfig } from "../../../src/config/schema.js";

describe("claudeProviderConfig", () => {
  describe("apikey auth", () => {
    it("accepts valid apikey config", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "apikey",
        apiKey: "sk-ant-api03-test",
      });
      expect(result.success).toBe(true);
    });

    it("rejects config without authType", () => {
      const result = claudeProviderConfig.safeParse({
        apiKey: "sk-ant-api03-test",
      });
      expect(result.success).toBe(false);
    });

    it("rejects apikey config without apiKey", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "apikey",
      });
      expect(result.success).toBe(false);
    });

    it("rejects apikey config with empty apiKey", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "apikey",
        apiKey: "",
      });
      expect(result.success).toBe(false);
    });

    it("accepts optional base fields", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "apikey",
        apiKey: "sk-ant-api03-test",
        model: "claude-sonnet-4-20250514",
        timeout: 120,
        baseUrl: "https://api.anthropic.com",
      });
      expect(result.success).toBe(true);
    });
  });

  describe("oauth auth", () => {
    it("accepts valid oauth config", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "oauth",
      });
      expect(result.success).toBe(true);
    });

    it("accepts oauth config with custom clientId", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "oauth",
        oauthClientId: "custom-client-id",
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data).toHaveProperty("oauthClientId", "custom-client-id");
      }
    });

    it("accepts oauth with optional base fields", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "oauth",
        model: "claude-sonnet-4-20250514",
        timeout: 60,
      });
      expect(result.success).toBe(true);
    });
  });

  describe("invalid", () => {
    it("rejects unknown authType", () => {
      const result = claudeProviderConfig.safeParse({
        authType: "unknown",
      });
      expect(result.success).toBe(false);
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/config/schema.test.ts`
Expected: FAIL — cannot resolve `../../../src/config/schema.js`

- [ ] **Step 3: Write the implementation**

```typescript
// src/config/schema.ts
import { z } from "zod";

const claudeBaseConfig = z.object({
  model: z.string().optional(),
  timeout: z.number().positive().optional(),
  baseUrl: z.string().url().optional(),
});

const claudeApiKeyAuth = claudeBaseConfig.extend({
  authType: z.literal("apikey"),
  apiKey: z.string().min(1),
});

const claudeOAuthAuth = claudeBaseConfig.extend({
  authType: z.literal("oauth"),
  oauthClientId: z.string().optional(),
});

export const claudeProviderConfig = z.discriminatedUnion("authType", [
  claudeApiKeyAuth,
  claudeOAuthAuth,
]);

export type ClaudeProviderConfig = z.infer<typeof claudeProviderConfig>;
export type ClaudeApiKeyConfig = z.infer<typeof claudeApiKeyAuth>;
export type ClaudeOAuthConfig = z.infer<typeof claudeOAuthAuth>;
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/config/schema.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/config/schema.ts tests/unit/config/schema.test.ts
git commit -m "feat(config): add Zod schema with discriminated union for claude provider"
```

---

## Chunk 2: PKCE & OAuth Server (Tasks 4-5)

### Task 4: PKCE Utility

Generates `code_verifier` (random 43-128 chars) and `code_challenge` (SHA-256 base64url of verifier).

**Files:**
- Create: `src/auth/pkce.ts`
- Test: `tests/unit/auth/pkce.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/auth/pkce.test.ts
import { describe, it, expect } from "vitest";
import { generatePKCE } from "../../../src/auth/pkce.js";

describe("PKCE", () => {
  it("generates a code_verifier of 43-128 characters", () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier.length).toBeGreaterThanOrEqual(43);
    expect(codeVerifier.length).toBeLessThanOrEqual(128);
  });

  it("code_verifier uses only URL-safe characters", () => {
    const { codeVerifier } = generatePKCE();
    expect(codeVerifier).toMatch(/^[A-Za-z0-9\-._~]+$/);
  });

  it("generates a non-empty code_challenge", () => {
    const { codeChallenge } = generatePKCE();
    expect(codeChallenge.length).toBeGreaterThan(0);
  });

  it("code_challenge is base64url encoded (no +, /, or =)", () => {
    const { codeChallenge } = generatePKCE();
    expect(codeChallenge).not.toMatch(/[+/=]/);
  });

  it("generates different values each call", () => {
    const a = generatePKCE();
    const b = generatePKCE();
    expect(a.codeVerifier).not.toBe(b.codeVerifier);
  });

  it("challengeMethod is S256", () => {
    const { challengeMethod } = generatePKCE();
    expect(challengeMethod).toBe("S256");
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/auth/pkce.test.ts`
Expected: FAIL — cannot resolve `../../../src/auth/pkce.js`

- [ ] **Step 3: Write the implementation**

```typescript
// src/auth/pkce.ts
import { randomBytes, createHash } from "node:crypto";

export interface PKCEPair {
  codeVerifier: string;
  codeChallenge: string;
  challengeMethod: "S256";
}

export function generatePKCE(): PKCEPair {
  const codeVerifier = randomBytes(48)
    .toString("base64url")
    .slice(0, 64);

  const codeChallenge = createHash("sha256")
    .update(codeVerifier)
    .digest("base64url");

  return { codeVerifier, codeChallenge, challengeMethod: "S256" };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/auth/pkce.test.ts`
Expected: All 6 tests PASS

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/auth/pkce.ts tests/unit/auth/pkce.test.ts
git commit -m "feat(auth): add PKCE code_verifier and code_challenge generation"
```

---

### Task 5: OAuth Callback Server

Temporary HTTP server on `127.0.0.1` that listens for the OAuth callback and extracts the authorization code. Also supports manual mode (parse pasted URL).

**Files:**
- Create: `src/auth/oauth-server.ts`
- Test: `tests/unit/auth/oauth-server.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/auth/oauth-server.test.ts
import { describe, it, expect, afterEach } from "vitest";
import {
  startCallbackServer,
  parseCallbackUrl,
  type CallbackServer,
} from "../../../src/auth/oauth-server.js";

describe("oauth-server", () => {
  let server: CallbackServer | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
  });

  describe("startCallbackServer", () => {
    it("starts a server on 127.0.0.1 with a random port", async () => {
      server = await startCallbackServer();
      expect(server.port).toBeGreaterThan(0);
      expect(server.redirectUri).toBe(
        `http://127.0.0.1:${server.port}/callback`,
      );
    });

    it("resolves authorization code on callback", async () => {
      server = await startCallbackServer();
      const codePromise = server.waitForCode();

      // Simulate browser redirect
      const url = `http://127.0.0.1:${server.port}/callback?code=test-auth-code&state=test-state`;
      await fetch(url);

      const result = await codePromise;
      expect(result.code).toBe("test-auth-code");
    });

    it("rejects on error callback", async () => {
      server = await startCallbackServer();
      const codePromise = server.waitForCode();

      const url = `http://127.0.0.1:${server.port}/callback?error=access_denied&error_description=User+denied`;
      await fetch(url);

      await expect(codePromise).rejects.toThrow("access_denied: User denied");
    });

    it("times out after specified duration", async () => {
      server = await startCallbackServer({ timeoutMs: 100 });
      const codePromise = server.waitForCode();
      await expect(codePromise).rejects.toThrow("timeout");
    });
  });

  describe("parseCallbackUrl", () => {
    it("extracts code from valid callback URL", () => {
      const result = parseCallbackUrl(
        "http://127.0.0.1:12345/callback?code=abc123&state=xyz",
      );
      expect(result.code).toBe("abc123");
    });

    it("throws on URL with error parameter", () => {
      expect(() =>
        parseCallbackUrl(
          "http://127.0.0.1:12345/callback?error=access_denied",
        ),
      ).toThrow("access_denied");
    });

    it("throws on URL without code parameter", () => {
      expect(() =>
        parseCallbackUrl("http://127.0.0.1:12345/callback"),
      ).toThrow("Authorization code missing");
    });

    it("handles full URLs from browser address bar", () => {
      const result = parseCallbackUrl(
        "http://127.0.0.1:54321/callback?code=real-code&state=s",
      );
      expect(result.code).toBe("real-code");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/auth/oauth-server.test.ts`
Expected: FAIL — cannot resolve `../../../src/auth/oauth-server.js`

- [ ] **Step 3: Write the implementation**

```typescript
// src/auth/oauth-server.ts
import { createServer, type Server } from "node:http";

export interface CallbackResult {
  code: string;
}

export interface CallbackServer {
  port: number;
  redirectUri: string;
  waitForCode(): Promise<CallbackResult>;
  close(): Promise<void>;
}

interface CallbackServerOptions {
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10 * 60 * 1000; // 10 minutes

export async function startCallbackServer(
  options?: CallbackServerOptions,
): Promise<CallbackServer> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  return new Promise((resolveStart, rejectStart) => {
    let resolveCode: ((result: CallbackResult) => void) | undefined;
    let rejectCode: ((error: Error) => void) | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;

    const codePromise = new Promise<CallbackResult>((res, rej) => {
      resolveCode = res;
      rejectCode = rej;
    });

    const server: Server = createServer((req, res) => {
      const url = new URL(req.url ?? "/", `http://127.0.0.1`);

      if (url.pathname !== "/callback") {
        res.writeHead(404);
        res.end("Not found");
        return;
      }

      try {
        const result = parseCallbackUrl(req.url ?? "", true);
        res.writeHead(200, { "Content-Type": "text/html" });
        res.end(
          "<html><body><h1>Authorization successful</h1><p>You can close this window.</p></body></html>",
        );
        resolveCode?.(result);
      } catch (err) {
        res.writeHead(400, { "Content-Type": "text/html" });
        res.end(
          `<html><body><h1>Authorization failed</h1><p>${(err as Error).message}</p></body></html>`,
        );
        rejectCode?.(err as Error);
      }

      if (timeoutId) clearTimeout(timeoutId);
    });

    server.listen(0, "127.0.0.1", () => {
      const addr = server.address();
      if (!addr || typeof addr === "string") {
        rejectStart(new Error("Failed to get server address"));
        return;
      }

      const port = addr.port;

      resolveStart({
        port,
        redirectUri: `http://127.0.0.1:${port}/callback`,
        waitForCode(): Promise<CallbackResult> {
          timeoutId = setTimeout(() => {
            rejectCode?.(new Error("OAuth callback timeout"));
            server.close();
          }, timeoutMs);
          return codePromise;
        },
        close(): Promise<void> {
          if (timeoutId) clearTimeout(timeoutId);
          return new Promise((res) => server.close(() => res()));
        },
      });
    });

    server.on("error", rejectStart);
  });
}

export function parseCallbackUrl(
  url: string,
  relativeOk = false,
): CallbackResult {
  const parsed = relativeOk
    ? new URL(url, "http://127.0.0.1")
    : new URL(url);

  const error = parsed.searchParams.get("error");
  if (error) {
    const desc = parsed.searchParams.get("error_description");
    throw new Error(desc ? `${error}: ${desc}` : error);
  }

  const code = parsed.searchParams.get("code");
  if (!code) {
    throw new Error("Authorization code missing from callback URL");
  }

  return { code };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/auth/oauth-server.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/auth/oauth-server.ts tests/unit/auth/oauth-server.test.ts
git commit -m "feat(auth): add OAuth callback server with manual URL parsing"
```

---

## Chunk 3: OAuth Strategy (Tasks 6-7)

### Task 6: OAuth Strategy — Core Logic

The main `OAuthStrategy` class: manages tokens, refreshes them, implements circuit breaker, returns `Authorization: Bearer` header.

**Files:**
- Create: `src/auth/oauth.ts`
- Test: `tests/unit/auth/oauth.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/unit/auth/oauth.test.ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { join } from "node:path";
import { createTempDir } from "../../helpers/index.js";
import { writeTokens, type OAuthCredentials } from "../../../src/auth/token-store.js";
import { OAuthStrategy } from "../../../src/auth/oauth.js";

// Mock the token refresh HTTP call
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("OAuthStrategy", () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;
  let tokenPath: string;
  let validTokens: OAuthCredentials;
  let expiredTokens: OAuthCredentials;

  beforeEach(async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
    tokenPath = join(tempDir, "oauth-credentials.json");
    vi.clearAllMocks();
    vi.useFakeTimers({ shouldAdvanceTime: true });

    validTokens = {
      version: 1,
      accessToken: "sk-ant-oat01-valid",
      refreshToken: "sk-ant-ort01-valid",
      expiresAt: Date.now() + 3600_000, // 1 hour from now
      scopes: ["user:inference", "user:profile"],
    };

    expiredTokens = {
      ...validTokens,
      expiresAt: Date.now() - 1000, // expired
    };
  });

  afterEach(async () => {
    vi.useRealTimers();
    await cleanup();
  });

  describe("getHeaders", () => {
    it("returns Bearer header with valid token", async () => {
      await writeTokens(tokenPath, validTokens);
      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      const headers = await strategy.getHeaders();
      expect(headers).toEqual({
        Authorization: "Bearer sk-ant-oat01-valid",
      });
    });

    it("refreshes token when expired", async () => {
      await writeTokens(tokenPath, expiredTokens);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "sk-ant-oat01-refreshed",
          refresh_token: "sk-ant-ort01-refreshed",
          expires_in: 3600,
        }),
      });

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      const headers = await strategy.getHeaders();
      expect(headers).toEqual({
        Authorization: "Bearer sk-ant-oat01-refreshed",
      });
      expect(mockFetch).toHaveBeenCalledOnce();
    });

    it("throws when refresh returns non-ok response", async () => {
      await writeTokens(tokenPath, expiredTokens);
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      await expect(strategy.getHeaders()).rejects.toThrow("Token refresh failed: 400");
    });

    it("throws when no tokens exist", async () => {
      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      await expect(strategy.getHeaders()).rejects.toThrow();
    });
  });

  describe("isValid", () => {
    it("returns true when token exists and not expired", async () => {
      await writeTokens(tokenPath, validTokens);
      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });
      expect(await strategy.isValid()).toBe(true);
    });

    it("returns false when no token file", async () => {
      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });
      expect(await strategy.isValid()).toBe(false);
    });
  });

  describe("circuit breaker", () => {
    it("enters open state after 3 consecutive refresh failures", async () => {
      await writeTokens(tokenPath, expiredTokens);
      mockFetch.mockRejectedValue(new Error("network error"));

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      // Exhaust 3 failures
      for (let i = 0; i < 3; i++) {
        await expect(strategy.getHeaders()).rejects.toThrow();
      }

      // 4th call should fail immediately with circuit breaker message
      await expect(strategy.getHeaders()).rejects.toThrow(
        /jalenclaw auth login/,
      );
      // No additional fetch calls (circuit is open)
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it("resets after cooldown period", async () => {
      await writeTokens(tokenPath, expiredTokens);
      mockFetch.mockRejectedValue(new Error("network error"));

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
        circuitBreakerCooldownMs: 1000,
      });

      // Trip the breaker
      for (let i = 0; i < 3; i++) {
        await expect(strategy.getHeaders()).rejects.toThrow();
      }

      // Advance past cooldown
      vi.advanceTimersByTime(1500);

      // Now it should try again (and fail, but the point is it tries)
      mockFetch.mockRejectedValueOnce(new Error("still failing"));
      await expect(strategy.getHeaders()).rejects.toThrow();
      expect(mockFetch).toHaveBeenCalledTimes(4);
    });
  });

  describe("proactive refresh", () => {
    it("refreshes token within 5 minutes of expiry", async () => {
      const soonExpiring: OAuthCredentials = {
        ...validTokens,
        expiresAt: Date.now() + 4 * 60 * 1000, // 4 minutes from now
      };
      await writeTokens(tokenPath, soonExpiring);
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          access_token: "sk-ant-oat01-proactive",
          refresh_token: "sk-ant-ort01-proactive",
          expires_in: 3600,
        }),
      });

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test-client",
      });

      const headers = await strategy.getHeaders();
      expect(headers.Authorization).toBe("Bearer sk-ant-oat01-proactive");
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test -- tests/unit/auth/oauth.test.ts`
Expected: FAIL — cannot resolve `../../../src/auth/oauth.js`

- [ ] **Step 3: Write the implementation**

```typescript
// src/auth/oauth.ts
import type { AuthStrategy } from "./strategy.js";
import {
  readTokens,
  writeTokens,
  type OAuthCredentials,
} from "./token-store.js";

export interface OAuthStrategyOptions {
  tokenPath: string;
  tokenEndpoint: string;
  clientId: string;
  circuitBreakerCooldownMs?: number;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 3;

export class OAuthStrategy implements AuthStrategy {
  private readonly tokenPath: string;
  private readonly tokenEndpoint: string;
  private readonly clientId: string;
  private readonly cooldownMs: number;

  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private cachedTokens: OAuthCredentials | null = null;

  constructor(options: OAuthStrategyOptions) {
    this.tokenPath = options.tokenPath;
    this.tokenEndpoint = options.tokenEndpoint;
    this.clientId = options.clientId;
    this.cooldownMs = options.circuitBreakerCooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  async getHeaders(): Promise<Record<string, string>> {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error(
        "OAuth authentication failed. Please run `jalenclaw auth login` to re-authenticate.",
      );
    }

    let tokens = await this.loadTokens();
    if (!tokens) {
      throw new Error(
        "No OAuth credentials found. Run `jalenclaw auth login` first.",
      );
    }

    // Proactive refresh if close to expiry
    if (this.needsRefresh(tokens)) {
      tokens = await this.refreshTokens(tokens);
    }

    return { Authorization: `Bearer ${tokens.accessToken}` };
  }

  async isValid(): Promise<boolean> {
    const tokens = await this.loadTokens();
    return tokens !== null && tokens.expiresAt > Date.now();
  }

  /** Called externally when auth_reload IPC message is received */
  clearCache(): void {
    this.cachedTokens = null;
  }

  /** Called externally after successful login/refresh to reset breaker */
  resetCircuitBreaker(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  private async loadTokens(): Promise<OAuthCredentials | null> {
    if (!this.cachedTokens) {
      this.cachedTokens = await readTokens(this.tokenPath);
    }
    return this.cachedTokens;
  }

  private needsRefresh(tokens: OAuthCredentials): boolean {
    return tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS;
  }

  private isCircuitOpen(): boolean {
    if (this.consecutiveFailures < MAX_FAILURES) return false;
    if (Date.now() > this.circuitOpenUntil) {
      // Cooldown expired, reset
      this.consecutiveFailures = 0;
      this.circuitOpenUntil = 0;
      return false;
    }
    return true;
  }

  private async refreshTokens(
    current: OAuthCredentials,
  ): Promise<OAuthCredentials> {
    try {
      const response = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: current.refreshToken,
          client_id: this.clientId,
        }).toString(),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      const refreshed: OAuthCredentials = {
        version: 1,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        scopes: current.scopes,
      };

      await writeTokens(this.tokenPath, refreshed);
      this.cachedTokens = refreshed;
      this.consecutiveFailures = 0;
      this.circuitOpenUntil = 0;
      return refreshed;
    } catch (err) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= MAX_FAILURES) {
        this.circuitOpenUntil = Date.now() + this.cooldownMs;
      }
      throw err;
    }
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test -- tests/unit/auth/oauth.test.ts`
Expected: All 7 tests PASS

- [ ] **Step 5: Run typecheck and lint**

Run: `pnpm run typecheck && pnpm run lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add src/auth/oauth.ts tests/unit/auth/oauth.test.ts
git commit -m "feat(auth): add OAuth strategy with token refresh and circuit breaker"
```

---

### Task 7: Integration Test — Full OAuth Flow

Tests the complete flow: start callback server → simulate authorization → exchange code → store tokens → read headers.

**Files:**
- Test: `tests/integration/auth/oauth-flow.test.ts`

- [ ] **Step 1: Write the integration test**

```typescript
// tests/integration/auth/oauth-flow.test.ts
import { describe, it, expect, afterEach, vi } from "vitest";
import { join } from "node:path";
import { createTempDir } from "../../helpers/index.js";
import { startCallbackServer } from "../../../src/auth/oauth-server.js";
import { generatePKCE } from "../../../src/auth/pkce.js";
import { writeTokens, readTokens, type OAuthCredentials } from "../../../src/auth/token-store.js";
import { OAuthStrategy } from "../../../src/auth/oauth.js";
import { ApiKeyStrategy } from "../../../src/auth/apikey.js";

describe("OAuth flow integration", () => {
  let tempDir: string;
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup();
  });

  it("callback server receives code, tokens can be stored and used", async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;
    const tokenPath = join(tempDir, "oauth-credentials.json");

    // Step 1: Generate PKCE
    const pkce = generatePKCE();
    expect(pkce.codeVerifier.length).toBeGreaterThanOrEqual(43);

    // Step 2: Start callback server
    const server = await startCallbackServer({ timeoutMs: 5000 });
    expect(server.port).toBeGreaterThan(0);

    try {
      // Step 3: Simulate browser callback
      const codePromise = server.waitForCode();
      await fetch(
        `http://127.0.0.1:${server.port}/callback?code=integration-test-code`,
      );
      const { code } = await codePromise;
      expect(code).toBe("integration-test-code");

      // Step 4: Simulate token exchange result and store
      const tokens: OAuthCredentials = {
        version: 1,
        accessToken: "sk-ant-oat01-integration",
        refreshToken: "sk-ant-ort01-integration",
        expiresAt: Date.now() + 3600_000,
        scopes: ["user:inference", "user:profile"],
      };
      await writeTokens(tokenPath, tokens);

      // Step 5: Use OAuthStrategy to get headers
      const mockFetch = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal("fetch", mockFetch);

      const strategy = new OAuthStrategy({
        tokenPath,
        tokenEndpoint: "https://claude.ai/oauth/token",
        clientId: "test",
      });
      const headers = await strategy.getHeaders();
      expect(headers.Authorization).toBe("Bearer sk-ant-oat01-integration");
    } finally {
      vi.unstubAllGlobals();
      await server.close();
    }
  });

  it("AuthStrategy interface works with both implementations", async () => {
    const tmp = await createTempDir();
    tempDir = tmp.path;
    cleanup = tmp.cleanup;

    // API Key strategy
    const apiKeyStrategy = new ApiKeyStrategy("sk-ant-api03-test");
    expect(await apiKeyStrategy.getHeaders()).toEqual({
      "X-Api-Key": "sk-ant-api03-test",
    });
    expect(await apiKeyStrategy.isValid()).toBe(true);

    // OAuth strategy (with pre-written valid token)
    const tokenPath = join(tempDir, "tokens.json");
    await writeTokens(tokenPath, {
      version: 1,
      accessToken: "sk-ant-oat01-test",
      refreshToken: "sk-ant-ort01-test",
      expiresAt: Date.now() + 3600_000,
      scopes: ["user:inference"],
    });

    const oauthStrategy = new OAuthStrategy({
      tokenPath,
      tokenEndpoint: "https://claude.ai/oauth/token",
      clientId: "test",
    });
    expect(await oauthStrategy.getHeaders()).toEqual({
      Authorization: "Bearer sk-ant-oat01-test",
    });
    expect(await oauthStrategy.isValid()).toBe(true);
  });
});
```

- [ ] **Step 2: Run the integration test**

Run: `pnpm test -- tests/integration/auth/oauth-flow.test.ts`
Expected: All 2 tests PASS

- [ ] **Step 3: Run full test suite**

Run: `pnpm test`
Expected: All tests across all files PASS

- [ ] **Step 4: Commit**

```bash
git add tests/integration/auth/oauth-flow.test.ts
git commit -m "test(auth): add integration test for complete OAuth flow"
```

---

## Chunk 4: Update Progress & Docs (Task 8)

### Task 8: Update Progress

- [ ] **Step 1: Update docs/progress.md**

Update to reflect all completed tasks:

```markdown
# JalenClaw 开发进度

## Current Step

All OAuth auth module tasks complete. Next: CLI commands (jalenclaw auth login/logout/status/refresh) — requires CLI framework setup (not yet specced).

## Completed Steps

- [x] Step 0: Project scaffold — <commit hash>
- [x] Step 1: Token store (read/write/delete oauth-credentials.json) — <commit hash>
- [x] Step 2: API Key strategy — <commit hash>
- [x] Step 3: Config schema (Zod discriminated union) — <commit hash>
- [x] Step 4: PKCE utility — <commit hash>
- [x] Step 5: OAuth callback server — <commit hash>
- [x] Step 6: OAuth strategy (refresh + circuit breaker) — <commit hash>
- [x] Step 7: Integration tests — <commit hash>

## Notes

- 2026-03-18: OAuth auth module core complete
- All src/auth/ modules implemented and tested
- src/config/schema.ts has Claude provider config with discriminated union
- CLI commands and full application integration depend on the CLI framework (not yet built)
- Next logical steps: CLI entry point, `jalenclaw auth` subcommands, then Gateway/Router integration
```

- [ ] **Step 2: Commit**

```bash
git add docs/progress.md
git commit -m "docs: update progress — OAuth auth module complete"
```
