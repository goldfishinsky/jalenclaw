// src/gateway/web/index.ts
import { type IncomingMessage, type ServerResponse } from "node:http";
import { DASHBOARD_HTML } from "./dashboard-html.js";

/**
 * Serve the dashboard HTML page at /dashboard.
 * HTML is embedded at compile time — no file reads needed at runtime.
 * Returns true if the request was handled.
 */
export function serveDashboard(req: IncomingMessage, res: ServerResponse): boolean {
  const url = new URL(req.url ?? "/", `http://${req.headers.host ?? "localhost"}`);

  if (url.pathname !== "/dashboard") {
    return false;
  }

  res.statusCode = 200;
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache");
  res.end(DASHBOARD_HTML);
  return true;
}

export { createDashboardApi } from "./api.js";
export type { DashboardApi, DashboardData } from "./api.js";
