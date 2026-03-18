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
