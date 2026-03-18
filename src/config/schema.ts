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

export const jalenClawConfig = z.object({
  gateway: z
    .object({
      host: z.string().default("127.0.0.1"),
      port: z.number().default(18900),
      tls: z.boolean().default(false),
    })
    .default({}),
  agent: z
    .object({
      isolation: z
        .enum(["docker", "apple-container", "process"])
        .default("docker"),
      idleTimeout: z.number().default(300),
      maxMemory: z.number().default(256),
    })
    .default({}),
  models: z
    .object({
      default: z.string().default("claude"),
      providers: z
        .object({
          claude: claudeProviderConfig.optional(),
          openai: z
            .object({
              authType: z.literal("apikey"),
              apiKey: z.string().min(1),
            })
            .optional(),
          deepseek: z
            .object({
              authType: z.literal("apikey"),
              apiKey: z.string().min(1),
            })
            .optional(),
          ollama: z
            .object({
              baseUrl: z.string().url().default("http://localhost:11434"),
            })
            .optional(),
        })
        .default({}),
    })
    .default({}),
  channels: z
    .record(
      z
        .object({
          enabled: z.boolean().default(false),
        })
        .passthrough(),
    )
    .default({}),
  memory: z
    .object({
      backend: z.enum(["auto", "sqlite", "postgres"]).default("auto"),
      maxEntries: z.number().default(10000),
      pruneStrategy: z.enum(["relevance"]).default("relevance"),
    })
    .default({}),
  rateLimit: z
    .object({
      maxRequestsPerMinute: z.number().default(60),
      burstSize: z.number().default(10),
    })
    .default({}),
});

export type JalenClawConfig = z.infer<typeof jalenClawConfig>;
