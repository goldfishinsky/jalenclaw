// src/config/loader.ts
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";
import { parse as parseYaml } from "yaml";
import { jalenClawConfig, type JalenClawConfig } from "./schema.js";

export interface LoadConfigOptions {
  configPath?: string; // override default path
}

const DEFAULT_CONFIG_PATH = path.join(
  os.homedir(),
  ".jalenclaw",
  "jalenclaw.yml",
);

/**
 * Recursively resolve `${VAR_NAME}` references in string values.
 * Throws if a referenced environment variable is not set.
 */
function resolveEnvVars(obj: unknown): unknown {
  if (typeof obj === "string") {
    return obj.replace(/\$\{([^}]+)\}/g, (_match, varName: string) => {
      const value = process.env[varName];
      if (value === undefined) {
        throw new Error(
          `Environment variable "${varName}" is not set but referenced in config`,
        );
      }
      return value;
    });
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => resolveEnvVars(item));
  }

  if (obj !== null && typeof obj === "object") {
    const resolved: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
      resolved[key] = resolveEnvVars(value);
    }
    return resolved;
  }

  return obj;
}

/**
 * Load JalenClaw config from a YAML file, resolve env var references,
 * and validate against the Zod schema.
 */
export async function loadConfig(
  options?: LoadConfigOptions,
): Promise<JalenClawConfig> {
  const configPath = path.resolve(options?.configPath ?? DEFAULT_CONFIG_PATH);

  let rawContent: string;
  try {
    rawContent = await fs.readFile(configPath, "utf-8");
  } catch (err) {
    if (
      err instanceof Error &&
      "code" in err &&
      (err as NodeJS.ErrnoException).code === "ENOENT"
    ) {
      throw new Error(`Config file not found: ${configPath}`);
    }
    throw err;
  }

  const parsed: unknown = parseYaml(rawContent) ?? {};

  const resolved = resolveEnvVars(parsed);

  const result = jalenClawConfig.safeParse(resolved);
  if (!result.success) {
    const issues = result.error.issues
      .map((i) => `  ${i.path.join(".")}: ${i.message}`)
      .join("\n");
    throw new Error(`Invalid config at ${configPath}:\n${issues}`);
  }

  return result.data;
}
