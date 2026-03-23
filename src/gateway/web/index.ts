// src/gateway/web/index.ts
import { type IncomingMessage, type ServerResponse } from "node:http";
import { DASHBOARD_HTML } from "./dashboard-html.js";

/**
 * Serve the dashboard HTML page at /dashboard.
 * HTML is embedded at compile time — no file reads needed at runtime.
 * The API key is injected into the HTML so the dashboard JS can connect via WebSocket.
 * Returns true if the request was handled.
 */
export function serveDashboard(req: IncomingMessage, res: ServerResponse, apiKey?: string): boolean {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname !== "/dashboard") {
    return false;
  }

  let html = DASHBOARD_HTML;
  html = html.replace("%%JALENCLAW_API_KEY%%", apiKey ?? "");

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(html);
  return true;
}

export { createDashboardApi } from "./api.js";
export type { DashboardApi, DashboardData } from "./api.js";
