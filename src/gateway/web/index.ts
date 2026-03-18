// src/gateway/web/index.ts
import { type IncomingMessage, type ServerResponse } from "node:http";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let cachedHtml: string | undefined;

function loadDashboardHtml(): string {
  if (!cachedHtml) {
    cachedHtml = readFileSync(join(__dirname, "dashboard.html"), "utf-8");
  }
  return cachedHtml;
}

/**
 * Serve the dashboard HTML page at /dashboard.
 * Returns true if the request was handled.
 */
export function serveDashboard(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname !== "/dashboard") {
    return false;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.end(loadDashboardHtml());
  return true;
}

export { createDashboardApi } from "./api.js";
export type { DashboardApi, DashboardData } from "./api.js";
