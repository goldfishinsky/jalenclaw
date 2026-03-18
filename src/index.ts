#!/usr/bin/env node
// src/index.ts
import { Command } from "commander";
import { registerAuthCommands } from "./cli/auth.js";

const program = new Command();
program
  .name("jalenclaw")
  .description("Multi-channel AI assistant platform")
  .version("0.1.0");

// Register subcommands
registerAuthCommands(program);

// Placeholder commands (to be implemented)
program
  .command("start")
  .description("Start JalenClaw")
  .option("-d, --daemon", "Run as daemon")
  .action(() => {
    console.log("Not yet implemented");
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

program.parse();
