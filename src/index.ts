#!/usr/bin/env node
// src/index.ts
import { Command } from "commander";
import { registerAuthCommands } from "./cli/auth.js";
import { startApp, printBanner } from "./cli/start.js";
import { checkConfigExists, runSetupWizard } from "./cli/setup.js";
import { readTokens } from "./auth/token-store.js";
import { loadConfig } from "./config/loader.js";
import { homedir } from "node:os";
import { join } from "node:path";

const program = new Command();
program
  .name("jalenclaw")
  .description("Multi-channel AI assistant platform")
  .version("0.1.0");

// Register subcommands
registerAuthCommands(program);

program
  .command("setup")
  .description("Re-run the setup wizard")
  .action(async () => {
    await runSetupWizard();
    try {
      const ctx = await startApp();
      printBanner(ctx);
    } catch (err) {
      console.error(
        "Failed to start:",
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  });

program
  .command("start")
  .description("Start JalenClaw")
  .option("-d, --daemon", "Run as daemon")
  .option("-c, --config <path>", "Path to config file")
  .action(async (opts: { daemon?: boolean; config?: string }) => {
    try {
      const ctx = await startApp({
        daemon: opts.daemon,
        configPath: opts.config,
      });
      printBanner(ctx);
    } catch (err) {
      console.error(
        "Failed to start:",
        err instanceof Error ? err.message : err,
      );
      process.exit(1);
    }
  });

program
  .command("stop")
  .description("Stop JalenClaw")
  .action(() => {
    console.log("Not yet implemented");
  });

program
  .command("status")
  .description("Show status")
  .action(() => {
    console.log("Not yet implemented");
  });

program
  .command("doctor")
  .description("Run diagnostics")
  .action(() => {
    console.log("Not yet implemented");
  });

// Default action: no subcommand → smart auto-detect
program.action(async () => {
  const needsSetup = await checkNeedsSetup();
  if (needsSetup) {
    await runSetupWizard();
  }
  try {
    const ctx = await startApp();
    printBanner(ctx);
  } catch (err) {
    console.error(
      "Failed to start:",
      err instanceof Error ? err.message : err,
    );
    process.exit(1);
  }
});

program.parse();

/**
 * Check if setup is needed:
 * - No config file → needs setup
 * - Config exists but OAuth selected and no valid token → needs setup
 * - Config exists but no providers configured → needs setup
 */
async function checkNeedsSetup(): Promise<boolean> {
  const configExists = await checkConfigExists();
  if (!configExists) return true;

  try {
    const config = await loadConfig();

    // Check if any provider is actually configured
    const providers = config.models?.providers ?? {};
    const hasProvider =
      providers.claude || providers.openai || providers.deepseek || providers.ollama;

    if (!hasProvider) return true;

    // If Claude OAuth is configured, check if we have a valid token
    if (providers.claude && "authType" in providers.claude && providers.claude.authType === "oauth") {
      const tokenPath = join(
        homedir(),
        ".jalenclaw",
        "auth",
        "oauth-credentials.json",
      );
      const tokens = await readTokens(tokenPath);
      if (!tokens) {
        console.log(
          "\n\u26A0\uFE0F  Claude OAuth is configured but no valid token found. Let's fix that.\n",
        );
        return true;
      }
    }

    return false;
  } catch {
    // Config exists but can't be loaded → re-setup
    return true;
  }
}
