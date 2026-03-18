#!/usr/bin/env node
// src/index.ts
import { Command } from "commander";
import { registerAuthCommands } from "./cli/auth.js";
import { startApp } from "./cli/start.js";
import { checkConfigExists, runSetupWizard } from "./cli/setup.js";

const program = new Command();
program
  .name("jalenclaw")
  .description("Multi-channel AI assistant platform")
  .version("0.1.0");

// Register subcommands
registerAuthCommands(program);

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
      console.log(`JalenClaw started on port ${ctx.gateway.port}`);
    } catch (err) {
      console.error("Failed to start JalenClaw:", err instanceof Error ? err.message : err);
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

// Default action: no subcommand → auto-detect setup or start
program.action(async () => {
  const configExists = await checkConfigExists();
  if (!configExists) {
    await runSetupWizard();
  }
  try {
    const ctx = await startApp();
    console.log(`JalenClaw started on port ${ctx.gateway.port}`);
  } catch (err) {
    console.error("Failed to start JalenClaw:", err instanceof Error ? err.message : err);
    process.exit(1);
  }
});

program.parse();
