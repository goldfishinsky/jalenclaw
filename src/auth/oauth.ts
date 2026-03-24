// src/auth/oauth.ts
import type { AuthStrategy } from "./strategy.js";
import {
  readTokens,
  writeTokens,
  type OAuthCredentials,
} from "./token-store.js";

export interface OAuthStrategyOptions {
  tokenPath: string;
  tokenEndpoint: string;
  clientId: string;
  circuitBreakerCooldownMs?: number;
}

const REFRESH_MARGIN_MS = 5 * 60 * 1000; // 5 minutes
const DEFAULT_COOLDOWN_MS = 15 * 60 * 1000; // 15 minutes
const MAX_FAILURES = 3;

export class OAuthStrategy implements AuthStrategy {
  private readonly tokenPath: string;
  private readonly tokenEndpoint: string;
  private readonly clientId: string;
  private readonly cooldownMs: number;

  private consecutiveFailures = 0;
  private circuitOpenUntil = 0;
  private cachedTokens: OAuthCredentials | null = null;

  constructor(options: OAuthStrategyOptions) {
    this.tokenPath = options.tokenPath;
    this.tokenEndpoint = options.tokenEndpoint;
    this.clientId = options.clientId;
    this.cooldownMs = options.circuitBreakerCooldownMs ?? DEFAULT_COOLDOWN_MS;
  }

  async getHeaders(): Promise<Record<string, string>> {
    // Check circuit breaker
    if (this.isCircuitOpen()) {
      throw new Error(
        "OAuth authentication failed. Please run `jalenclaw auth login` to re-authenticate.",
      );
    }

    let tokens = await this.loadTokens();
    if (!tokens) {
      throw new Error(
        "No OAuth credentials found. Run `jalenclaw auth login` first.",
      );
    }

    // Proactive refresh if close to expiry
    if (this.needsRefresh(tokens)) {
      tokens = await this.refreshTokens(tokens);
    }

    return { "x-api-key": tokens.accessToken };
  }

  async isValid(): Promise<boolean> {
    const tokens = await this.loadTokens();
    return tokens !== null && tokens.expiresAt > Date.now();
  }

  /** Called externally when auth_reload IPC message is received */
  clearCache(): void {
    this.cachedTokens = null;
  }

  /** Called externally after successful login/refresh to reset breaker */
  resetCircuitBreaker(): void {
    this.consecutiveFailures = 0;
    this.circuitOpenUntil = 0;
  }

  private async loadTokens(): Promise<OAuthCredentials | null> {
    if (!this.cachedTokens) {
      this.cachedTokens = await readTokens(this.tokenPath);
    }
    return this.cachedTokens;
  }

  private needsRefresh(tokens: OAuthCredentials): boolean {
    return tokens.expiresAt - Date.now() < REFRESH_MARGIN_MS;
  }

  private isCircuitOpen(): boolean {
    if (this.consecutiveFailures < MAX_FAILURES) return false;
    if (Date.now() > this.circuitOpenUntil) {
      // Cooldown expired, reset
      this.consecutiveFailures = 0;
      this.circuitOpenUntil = 0;
      return false;
    }
    return true;
  }

  private async refreshTokens(
    current: OAuthCredentials,
  ): Promise<OAuthCredentials> {
    try {
      const response = await fetch(this.tokenEndpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Accept": "application/json",
        },
        body: JSON.stringify({
          grant_type: "refresh_token",
          client_id: this.clientId,
          refresh_token: current.refreshToken,
        }),
      });

      if (!response.ok) {
        throw new Error(`Token refresh failed: ${response.status}`);
      }

      const data = (await response.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      const refreshed: OAuthCredentials = {
        version: 1,
        accessToken: data.access_token,
        refreshToken: data.refresh_token,
        expiresAt: Date.now() + data.expires_in * 1000,
        scopes: current.scopes,
      };

      await writeTokens(this.tokenPath, refreshed);
      this.cachedTokens = refreshed;
      this.consecutiveFailures = 0;
      this.circuitOpenUntil = 0;
      return refreshed;
    } catch (err) {
      this.consecutiveFailures++;
      if (this.consecutiveFailures >= MAX_FAILURES) {
        this.circuitOpenUntil = Date.now() + this.cooldownMs;
      }
      throw err;
    }
  }
}
