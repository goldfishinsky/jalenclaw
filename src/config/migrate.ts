// src/config/migrate.ts

export interface MigrationStep {
  fromVersion: number;
  toVersion: number;
  migrate(config: Record<string, unknown>): Record<string, unknown>;
}

/**
 * Registry of all known migration steps, ordered by fromVersion.
 */
const migrations: MigrationStep[] = [
  {
    fromVersion: 0,
    toVersion: 1,
    migrate(config: Record<string, unknown>): Record<string, unknown> {
      // Add authType: "apikey" to claude provider if missing
      const models = config.models as Record<string, unknown> | undefined;
      if (!models) return { ...config, configVersion: 1 };

      const providers = models.providers as
        | Record<string, unknown>
        | undefined;
      if (!providers) return { ...config, configVersion: 1 };

      const claude = providers.claude as Record<string, unknown> | undefined;
      if (claude && !claude.authType) {
        return {
          ...config,
          configVersion: 1,
          models: {
            ...models,
            providers: {
              ...providers,
              claude: {
                ...claude,
                authType: "apikey",
              },
            },
          },
        };
      }

      return { ...config, configVersion: 1 };
    },
  },
];

/**
 * Returns the current config version, defaulting to 0 for versionless configs.
 */
export function getCurrentVersion(config: Record<string, unknown>): number {
  const version = config.configVersion;
  if (typeof version === "number" && Number.isInteger(version)) {
    return version;
  }
  return 0;
}

/**
 * Register additional migration steps (useful for testing multi-step migrations).
 */
export function registerMigration(step: MigrationStep): void {
  migrations.push(step);
  migrations.sort((a, b) => a.fromVersion - b.fromVersion);
}

/**
 * Clear all migrations except built-in ones (for testing).
 */
export function resetMigrations(): void {
  migrations.length = 0;
  // Re-add the built-in v0->v1 migration
  migrations.push({
    fromVersion: 0,
    toVersion: 1,
    migrate(config: Record<string, unknown>): Record<string, unknown> {
      const models = config.models as Record<string, unknown> | undefined;
      if (!models) return { ...config, configVersion: 1 };

      const providers = models.providers as
        | Record<string, unknown>
        | undefined;
      if (!providers) return { ...config, configVersion: 1 };

      const claude = providers.claude as Record<string, unknown> | undefined;
      if (claude && !claude.authType) {
        return {
          ...config,
          configVersion: 1,
          models: {
            ...models,
            providers: {
              ...providers,
              claude: {
                ...claude,
                authType: "apikey",
              },
            },
          },
        };
      }

      return { ...config, configVersion: 1 };
    },
  });
}

/**
 * Migrate a config object from its current version to the target version.
 * Applies migration steps sequentially.
 */
export function migrateConfig(
  config: Record<string, unknown>,
  targetVersion: number,
): Record<string, unknown> {
  let current = { ...config };
  let version = getCurrentVersion(current);

  if (version >= targetVersion) {
    return current;
  }

  while (version < targetVersion) {
    const step = migrations.find((m) => m.fromVersion === version);
    if (!step) {
      throw new Error(
        `No migration path from version ${version} to ${targetVersion}`,
      );
    }
    current = step.migrate(current);
    version = step.toVersion;
  }

  return current;
}
