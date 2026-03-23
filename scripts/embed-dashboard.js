#!/usr/bin/env node
// Embeds dashboard.html into a TypeScript string export.
// Handles backticks and ${} properly without fragile sed.
import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, "..");

const html = readFileSync(join(root, "src/gateway/web/dashboard.html"), "utf-8");

// Escape backticks and ${ sequences for template literal embedding
const escaped = html
  .replace(/\\/g, "\\\\")
  .replace(/`/g, "\\`")
  .replace(/\$\{/g, "\\${");

const output = `// Auto-generated from dashboard.html — do not edit directly.\n// Run: node scripts/embed-dashboard.js\nexport const DASHBOARD_HTML = \`${escaped}\`;\n`;

writeFileSync(join(root, "src/gateway/web/dashboard-html.ts"), output, "utf-8");
console.log("dashboard-html.ts generated successfully.");
