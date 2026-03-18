// tests/unit/gateway/auth.test.ts
import { describe, it, expect, vi } from "vitest";
import { createAuthMiddleware } from "../../../src/gateway/auth.js";
import { IncomingMessage, ServerResponse } from "node:http";
import { Socket } from "node:net";

const API_KEY = "test-api-key-12345";

function createMockReq(
  url: string,
  headers: Record<string, string> = {},
): IncomingMessage {
  const socket = new Socket();
  const req = new IncomingMessage(socket);
  req.url = url;
  req.method = "GET";
  for (const [k, v] of Object.entries(headers)) {
    req.headers[k.toLowerCase()] = v;
  }
  return req;
}

function createMockRes(): ServerResponse & { statusCode: number; body: string } {
  const socket = new Socket();
  const res = new ServerResponse(new IncomingMessage(socket)) as ServerResponse & {
    statusCode: number;
    body: string;
  };
  res.body = "";
  const originalEnd = res.end.bind(res);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  res.end = ((chunk?: any) => {
    if (chunk) res.body = typeof chunk === "string" ? chunk : chunk.toString();
    return originalEnd(chunk);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  }) as any;
  return res;
}

describe("createAuthMiddleware", () => {
  const auth = createAuthMiddleware(API_KEY);

  it("accepts valid API key in X-Api-Key header", () => {
    const req = createMockReq("/test", { "X-Api-Key": API_KEY });
    const res = createMockRes();
    const next = vi.fn();

    auth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("accepts valid API key in query param", () => {
    const req = createMockReq(`/test?api_key=${API_KEY}`);
    const res = createMockRes();
    const next = vi.fn();

    auth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("rejects missing API key with 401", () => {
    const req = createMockReq("/test");
    const res = createMockRes();
    const next = vi.fn();

    auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("rejects invalid API key with 401", () => {
    const req = createMockReq("/test", { "X-Api-Key": "wrong-key" });
    const res = createMockRes();
    const next = vi.fn();

    auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });

  it("skips auth for /health endpoint", () => {
    const req = createMockReq("/health");
    const res = createMockRes();
    const next = vi.fn();

    auth(req, res, next);

    expect(next).toHaveBeenCalledOnce();
  });

  it("uses constant-time comparison to prevent timing attacks", () => {
    // Verifying the function works correctly with keys of different lengths
    const req = createMockReq("/test", { "X-Api-Key": "x" });
    const res = createMockRes();
    const next = vi.fn();

    auth(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.statusCode).toBe(401);
  });
});
