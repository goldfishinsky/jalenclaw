// src/auth/bearer.ts
import type { AuthStrategy } from "./strategy.js";

/**
 * Simple Bearer token strategy for OAuth access tokens.
 * Sends `Authorization: Bearer <token>` header without attempting refresh.
 */
export class BearerTokenStrategy implements AuthStrategy {
  constructor(private readonly token: string) {}

  async getHeaders(): Promise<Record<string, string>> {
    return { Authorization: `Bearer ${this.token}` };
  }

  async isValid(): Promise<boolean> {
    return this.token.length > 0;
  }
}
