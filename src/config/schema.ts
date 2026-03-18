// src/config/schema.ts
import { z } from "zod";

const claudeBaseConfig = z.object({
  model: z.string().optional(),
  timeout: z.number().positive().optional(),
  baseUrl: z.string().url().optional(),
});

const claudeApiKeyAuth = claudeBaseConfig.extend({
  authType: z.literal("apikey"),
  apiKey: z.string().min(1),
});

const claudeOAuthAuth = claudeBaseConfig.extend({
  authType: z.literal("oauth"),
  oauthClientId: z.string().optional(),
});

export const claudeProviderConfig = z.discriminatedUnion("authType", [
  claudeApiKeyAuth,
  claudeOAuthAuth,
]);

export type ClaudeProviderConfig = z.infer<typeof claudeProviderConfig>;
export type ClaudeApiKeyConfig = z.infer<typeof claudeApiKeyAuth>;
export type ClaudeOAuthConfig = z.infer<typeof claudeOAuthAuth>;
