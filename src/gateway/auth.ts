// src/gateway/auth.ts
import { type IncomingMessage, type ServerResponse } from "node:http";
import { timingSafeEqual } from "node:crypto";

/** Paths that bypass authentication. */
const PUBLIC_PATHS = new Set(["/health"]);

export type NextFn = () => void;

/**
 * Create an authentication middleware that validates API keys.
 * Checks X-Api-Key header first, then ?api_key query param.
 * Uses constant-time comparison to prevent timing attacks.
 */
export function createAuthMiddleware(
  apiKey: string,
): (req: IncomingMessage, res: ServerResponse, next: NextFn) => void {
  const expectedBuf = Buffer.from(apiKey, "utf-8");

  return (req: IncomingMessage, res: ServerResponse, next: NextFn): void => {
    const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

    // Public endpoints skip auth
    if (PUBLIC_PATHS.has(url.pathname)) {
      next();
      return;
    }

    // Extract key from header or query param
    const headerKey = req.headers["x-api-key"] as string | undefined;
    const queryKey = url.searchParams.get("api_key") ?? undefined;
    const providedKey = headerKey ?? queryKey;

    if (!providedKey || !safeCompare(expectedBuf, providedKey)) {
      res.statusCode = 401;
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify({ error: "Unauthorized" }));
      return;
    }

    next();
  };
}

/**
 * Constant-time string comparison to prevent timing attacks.
 * Returns false for different-length strings without leaking length info via timing.
 */
function safeCompare(expected: Buffer, provided: string): boolean {
  const providedBuf = Buffer.from(provided, "utf-8");
  if (expected.length !== providedBuf.length) {
    // Still do a comparison to avoid timing leak on length difference
    timingSafeEqual(expected, Buffer.alloc(expected.length));
    return false;
  }
  return timingSafeEqual(expected, providedBuf);
}
