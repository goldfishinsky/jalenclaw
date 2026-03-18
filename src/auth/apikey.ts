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
