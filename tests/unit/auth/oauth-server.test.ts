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

    it("starts a server on a specified fixed port", async () => {
      // Use a high random port to avoid conflicts
      const fixedPort = 49152 + Math.floor(Math.random() * 1000);
      server = await startCallbackServer({ port: fixedPort });
      expect(server.port).toBe(fixedPort);
      expect(server.redirectUri).toBe(
        `http://127.0.0.1:${fixedPort}/callback`,
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
