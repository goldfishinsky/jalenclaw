// tests/unit/auth/bearer.test.ts
import { describe, it, expect } from "vitest";
import { BearerTokenStrategy } from "../../../src/auth/bearer.js";

describe("BearerTokenStrategy", () => {
  it("returns Authorization Bearer header", async () => {
    const strategy = new BearerTokenStrategy("test-access-token");
    const headers = await strategy.getHeaders();
    expect(headers).toEqual({ Authorization: "Bearer test-access-token" });
  });

  it("isValid returns true when token is non-empty", async () => {
    const strategy = new BearerTokenStrategy("some-token");
    expect(await strategy.isValid()).toBe(true);
  });

  it("isValid returns false when token is empty", async () => {
    const strategy = new BearerTokenStrategy("");
    expect(await strategy.isValid()).toBe(false);
  });
});
