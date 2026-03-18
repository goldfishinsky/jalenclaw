// tests/unit/gateway/rate-limiter.test.ts
import { describe, it, expect, beforeEach } from "vitest";
import { createRateLimiter } from "../../../src/gateway/rate-limiter.js";

describe("createRateLimiter", () => {
  const options = { maxRequestsPerMinute: 6, burstSize: 3 };

  let limiter: ReturnType<typeof createRateLimiter>;

  beforeEach(() => {
    limiter = createRateLimiter(options);
  });

  it("allows requests under the burst limit", () => {
    for (let i = 0; i < 3; i++) {
      expect(limiter.check("10.0.0.1").allowed).toBe(true);
    }
  });

  it("blocks requests that exceed the burst limit", () => {
    for (let i = 0; i < 3; i++) {
      limiter.check("10.0.0.1");
    }
    const result = limiter.check("10.0.0.1");
    expect(result.allowed).toBe(false);
  });

  it("returns retryAfterMs when blocked", () => {
    for (let i = 0; i < 3; i++) {
      limiter.check("10.0.0.1");
    }
    const result = limiter.check("10.0.0.1");
    expect(result.allowed).toBe(false);
    expect(result.retryAfterMs).toBeTypeOf("number");
    expect(result.retryAfterMs!).toBeGreaterThan(0);
  });

  it("tracks per-IP independently", () => {
    // Exhaust limit for IP A
    for (let i = 0; i < 3; i++) {
      limiter.check("10.0.0.1");
    }
    expect(limiter.check("10.0.0.1").allowed).toBe(false);

    // IP B should still be allowed
    expect(limiter.check("10.0.0.2").allowed).toBe(true);
  });

  it("resets correctly", () => {
    for (let i = 0; i < 3; i++) {
      limiter.check("10.0.0.1");
    }
    expect(limiter.check("10.0.0.1").allowed).toBe(false);

    limiter.reset();
    expect(limiter.check("10.0.0.1").allowed).toBe(true);
  });

  it("rate-limits localhost the same as external IPs", () => {
    for (let i = 0; i < 3; i++) {
      limiter.check("127.0.0.1");
    }
    expect(limiter.check("127.0.0.1").allowed).toBe(false);
  });
});
