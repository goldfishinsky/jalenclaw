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
