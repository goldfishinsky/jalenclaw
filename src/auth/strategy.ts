/**
 * Authentication strategy interface for LLM providers.
 * Implementations: ApiKeyStrategy, OAuthStrategy
 */
export interface AuthStrategy {
  /** Returns HTTP headers for authenticating with the LLM provider */
  getHeaders(): Promise<Record<string, string>>;

  /** Whether the current credentials are valid */
  isValid(): Promise<boolean>;
}
