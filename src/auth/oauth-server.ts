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
    // Prevent unhandled rejection if error arrives before waitForCode() is awaited
    codePromise.catch(() => {});

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
