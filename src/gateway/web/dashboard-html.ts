export const DASHBOARD_HTML = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>JalenClaw Dashboard</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    :root {
      --bg-body: #0f1117;
      --bg-sidebar: #141620;
      --bg-header: #161824;
      --bg-card: #1a1d27;
      --bg-card-hover: #1e2130;
      --bg-input: #12141e;
      --border: #2a2d3a;
      --border-light: #333647;
      --text-primary: #e4e4e7;
      --text-secondary: #8b8d9a;
      --text-muted: #5c5e6e;
      --accent: #6366f1;
      --accent-dim: rgba(99, 102, 241, 0.15);
      --accent-glow: rgba(99, 102, 241, 0.3);
      --green: #22c55e;
      --green-dim: rgba(34, 197, 94, 0.15);
      --red: #ef4444;
      --red-dim: rgba(239, 68, 68, 0.15);
      --yellow: #eab308;
      --yellow-dim: rgba(234, 179, 8, 0.15);
      --blue: #3b82f6;
      --purple: #a78bfa;
      --orange: #f97316;
      --radius: 8px;
      --radius-lg: 12px;
      --shadow: 0 1px 3px rgba(0,0,0,0.3), 0 1px 2px rgba(0,0,0,0.2);
      --shadow-lg: 0 4px 12px rgba(0,0,0,0.4);
      --sidebar-width: 220px;
      --header-height: 56px;
      --mono: "SF Mono", "Cascadia Code", "Fira Code", "JetBrains Mono", Consolas, monospace;
      --sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Inter, Helvetica, Arial, sans-serif;
    }

    body {
      font-family: var(--sans);
      background: var(--bg-body);
      color: var(--text-primary);
      line-height: 1.5;
      min-height: 100vh;
      display: grid;
      grid-template-columns: var(--sidebar-width) 1fr;
      grid-template-rows: var(--header-height) 1fr auto;
      grid-template-areas:
        "sidebar header"
        "sidebar main"
        "sidebar footer";
    }

    /* ── Header ── */
    .header {
      grid-area: header;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 28px;
      background: var(--bg-header);
      border-bottom: 1px solid var(--border);
      z-index: 10;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 16px;
    }

    .header-breadcrumb {
      font-size: 14px;
      color: var(--text-secondary);
    }

    .header-breadcrumb strong {
      color: var(--text-primary);
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 20px;
    }

    .last-updated {
      font-size: 12px;
      color: var(--text-muted);
      font-family: var(--mono);
    }

    .conn-status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      font-size: 12px;
      font-weight: 500;
      padding: 4px 12px;
      border-radius: 20px;
      background: var(--bg-input);
      border: 1px solid var(--border);
      transition: all 0.3s ease;
    }

    .conn-status.live {
      border-color: rgba(34,197,94,0.3);
      background: var(--green-dim);
    }

    .conn-dot {
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background: var(--text-muted);
      transition: all 0.3s ease;
    }

    .conn-dot.live {
      background: var(--green);
      box-shadow: 0 0 8px var(--green);
      animation: pulse 2s infinite;
    }

    .conn-dot.dead {
      background: var(--red);
      box-shadow: 0 0 6px var(--red);
    }

    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.5; }
    }

    .uptime-badge {
      font-family: var(--mono);
      font-size: 12px;
      color: var(--text-secondary);
      background: var(--bg-input);
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: 6px;
    }

    /* ── Sidebar ── */
    .sidebar {
      grid-area: sidebar;
      background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      display: flex;
      flex-direction: column;
      z-index: 20;
    }

    .sidebar-logo {
      height: var(--header-height);
      display: flex;
      align-items: center;
      padding: 0 20px;
      border-bottom: 1px solid var(--border);
      gap: 10px;
    }

    .sidebar-logo-icon {
      width: 28px;
      height: 28px;
      border-radius: 6px;
      background: linear-gradient(135deg, var(--accent), #818cf8);
      display: flex;
      align-items: center;
      justify-content: center;
      font-weight: 800;
      font-size: 14px;
      color: #fff;
      flex-shrink: 0;
    }

    .sidebar-logo-text {
      font-size: 16px;
      font-weight: 700;
      letter-spacing: -0.3px;
    }

    .sidebar-version {
      font-size: 10px;
      color: var(--text-muted);
      font-family: var(--mono);
      background: var(--bg-input);
      padding: 1px 6px;
      border-radius: 4px;
      margin-left: auto;
    }

    .sidebar-nav {
      padding: 12px 10px;
      flex: 1;
    }

    .sidebar-section-label {
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 1px;
      color: var(--text-muted);
      padding: 12px 10px 6px;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 9px 12px;
      border-radius: 6px;
      font-size: 13px;
      font-weight: 500;
      color: var(--text-secondary);
      cursor: pointer;
      transition: all 0.15s ease;
      text-decoration: none;
    }

    .nav-item:hover {
      background: rgba(255,255,255,0.04);
      color: var(--text-primary);
    }

    .nav-item.active {
      background: var(--accent-dim);
      color: var(--accent);
    }

    .nav-icon {
      width: 18px;
      height: 18px;
      display: flex;
      align-items: center;
      justify-content: center;
      font-size: 14px;
      opacity: 0.8;
    }

    .sidebar-bottom {
      padding: 12px 16px;
      border-top: 1px solid var(--border);
    }

    .sidebar-bottom-info {
      font-size: 11px;
      color: var(--text-muted);
      line-height: 1.6;
    }

    /* ── Mobile sidebar toggle ── */
    .mobile-toggle {
      display: none;
      background: none;
      border: none;
      color: var(--text-primary);
      font-size: 20px;
      cursor: pointer;
      padding: 4px;
    }

    /* ── Main ── */
    .main {
      grid-area: main;
      padding: 24px 28px;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .main-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      max-width: 1400px;
    }

    .card {
      background: var(--bg-card);
      border: 1px solid var(--border);
      border-radius: var(--radius-lg);
      box-shadow: var(--shadow);
      overflow: hidden;
      transition: border-color 0.2s ease;
    }

    .card:hover {
      border-color: var(--border-light);
    }

    .card-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 16px 20px;
      border-bottom: 1px solid var(--border);
    }

    .card-title {
      font-size: 13px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.6px;
      color: var(--text-secondary);
    }

    .card-badge {
      font-size: 11px;
      font-family: var(--mono);
      padding: 2px 8px;
      border-radius: 10px;
      background: var(--accent-dim);
      color: var(--accent);
    }

    .card-body {
      padding: 20px;
    }

    .card-full {
      grid-column: 1 / -1;
    }

    /* ── System Status Card ── */
    .system-stats {
      display: grid;
      grid-template-columns: auto 1fr;
      gap: 24px;
      align-items: center;
    }

    .gauge-container {
      display: flex;
      gap: 20px;
    }

    .gauge {
      position: relative;
      width: 90px;
      height: 90px;
    }

    .gauge svg {
      transform: rotate(-90deg);
      width: 90px;
      height: 90px;
    }

    .gauge-bg {
      fill: none;
      stroke: var(--bg-input);
      stroke-width: 8;
    }

    .gauge-fill {
      fill: none;
      stroke-width: 8;
      stroke-linecap: round;
      transition: stroke-dashoffset 0.6s ease;
    }

    .gauge-fill.cpu { stroke: var(--accent); }
    .gauge-fill.memory { stroke: var(--purple); }

    .gauge-label {
      position: absolute;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      text-align: center;
    }

    .gauge-value {
      font-family: var(--mono);
      font-size: 16px;
      font-weight: 700;
      line-height: 1;
    }

    .gauge-caption {
      font-size: 9px;
      color: var(--text-muted);
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-top: 2px;
    }

    .system-info-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }

    .info-item {
      background: var(--bg-input);
      border-radius: 6px;
      padding: 10px 14px;
    }

    .info-label {
      font-size: 10px;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-muted);
      margin-bottom: 4px;
    }

    .info-value {
      font-family: var(--mono);
      font-size: 14px;
      font-weight: 600;
    }

    /* ── Channels Card ── */
    .channel-list {
      list-style: none;
    }

    .channel-item {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 12px 0;
      border-bottom: 1px solid var(--border);
    }

    .channel-item:last-child {
      border-bottom: none;
      padding-bottom: 0;
    }

    .channel-item:first-child {
      padding-top: 0;
    }

    .channel-left {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .status-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      flex-shrink: 0;
    }

    .status-dot.connected {
      background: var(--green);
      box-shadow: 0 0 6px var(--green);
    }

    .status-dot.disconnected {
      background: var(--red);
      box-shadow: 0 0 6px var(--red);
    }

    .status-dot.starting, .status-dot.connecting {
      background: var(--yellow);
      box-shadow: 0 0 6px var(--yellow);
      animation: pulse 1.5s infinite;
    }

    .channel-name {
      font-size: 14px;
      font-weight: 500;
    }

    .channel-right {
      display: flex;
      align-items: center;
      gap: 16px;
      text-align: right;
    }

    .channel-msgs {
      font-family: var(--mono);
      font-size: 12px;
      color: var(--text-secondary);
    }

    .channel-time {
      font-size: 11px;
      color: var(--text-muted);
      min-width: 70px;
      text-align: right;
    }

    .status-badge {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      padding: 2px 8px;
      border-radius: 4px;
    }

    .status-badge.connected {
      background: var(--green-dim);
      color: var(--green);
    }

    .status-badge.disconnected {
      background: var(--red-dim);
      color: var(--red);
    }

    .status-badge.starting, .status-badge.connecting {
      background: var(--yellow-dim);
      color: var(--yellow);
    }

    /* ── Sessions Card ── */
    .sessions-table {
      width: 100%;
      border-collapse: collapse;
      font-size: 13px;
    }

    .sessions-table th {
      text-align: left;
      font-size: 10px;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.8px;
      color: var(--text-muted);
      padding: 0 12px 10px 0;
      border-bottom: 1px solid var(--border);
    }

    .sessions-table td {
      padding: 10px 12px 10px 0;
      border-bottom: 1px solid var(--border);
      vertical-align: middle;
    }

    .sessions-table tr:last-child td {
      border-bottom: none;
    }

    .sessions-table .mono {
      font-family: var(--mono);
      font-size: 12px;
    }

    .provider-tag {
      display: inline-block;
      font-size: 10px;
      font-weight: 600;
      padding: 2px 8px;
      border-radius: 4px;
      background: var(--accent-dim);
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .provider-tag.openai { background: var(--green-dim); color: var(--green); }
    .provider-tag.anthropic { background: rgba(167,139,250,0.15); color: var(--purple); }
    .provider-tag.google { background: var(--yellow-dim); color: var(--yellow); }

    /* ── LLM Usage Card ── */
    .llm-bars {
      display: flex;
      flex-direction: column;
      gap: 16px;
    }

    .llm-bar-row {
      display: flex;
      flex-direction: column;
      gap: 6px;
    }

    .llm-bar-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
    }

    .llm-bar-name {
      font-size: 13px;
      font-weight: 600;
    }

    .llm-bar-stats {
      font-size: 12px;
      font-family: var(--mono);
      color: var(--text-secondary);
    }

    .llm-bar-track {
      height: 10px;
      background: var(--bg-input);
      border-radius: 5px;
      overflow: hidden;
    }

    .llm-bar-fill {
      height: 100%;
      border-radius: 5px;
      transition: width 0.5s ease;
      min-width: 2px;
    }

    .llm-bar-fill.openai { background: linear-gradient(90deg, #22c55e, #4ade80); }
    .llm-bar-fill.anthropic { background: linear-gradient(90deg, #a78bfa, #c4b5fd); }
    .llm-bar-fill.google { background: linear-gradient(90deg, #eab308, #facc15); }
    .llm-bar-fill.default { background: linear-gradient(90deg, var(--accent), #818cf8); }

    .llm-bar-detail {
      display: flex;
      gap: 16px;
      font-size: 11px;
      color: var(--text-muted);
    }

    /* ── Messages Card ── */
    .message-feed {
      max-height: 400px;
      overflow-y: auto;
      font-family: var(--mono);
      font-size: 12px;
    }

    .message-feed::-webkit-scrollbar {
      width: 5px;
    }

    .message-feed::-webkit-scrollbar-track {
      background: transparent;
    }

    .message-feed::-webkit-scrollbar-thumb {
      background: var(--border);
      border-radius: 3px;
    }

    .msg-row {
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 6px 8px;
      border-bottom: 1px solid rgba(42,45,58,0.5);
      transition: background 0.1s ease;
    }

    .msg-row:hover {
      background: var(--bg-card-hover);
    }

    .msg-row.new {
      animation: fadeIn 0.3s ease;
    }

    @keyframes fadeIn {
      from { opacity: 0; transform: translateY(-4px); }
      to { opacity: 1; transform: translateY(0); }
    }

    .msg-time {
      color: var(--text-muted);
      flex-shrink: 0;
      min-width: 60px;
      font-size: 11px;
    }

    .msg-dir {
      flex-shrink: 0;
      width: 18px;
      text-align: center;
      font-weight: 700;
      font-size: 13px;
    }

    .msg-dir.inbound { color: var(--green); }
    .msg-dir.outbound { color: var(--blue); }

    .msg-channel-badge {
      flex-shrink: 0;
      font-size: 10px;
      font-weight: 600;
      padding: 1px 7px;
      border-radius: 3px;
      background: rgba(99,102,241,0.12);
      color: var(--accent);
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .msg-preview {
      color: var(--text-secondary);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      flex: 1;
      min-width: 0;
    }

    /* ── Empty States ── */
    .empty-state {
      text-align: center;
      padding: 32px 16px;
      color: var(--text-muted);
      font-size: 13px;
    }

    .empty-state-icon {
      font-size: 28px;
      margin-bottom: 8px;
      opacity: 0.4;
    }

    /* ── Footer ── */
    .footer {
      grid-area: footer;
      padding: 12px 28px;
      border-top: 1px solid var(--border);
      font-size: 12px;
      color: var(--text-muted);
      text-align: center;
    }

    .footer a {
      color: var(--accent);
      text-decoration: none;
    }

    .footer a:hover {
      text-decoration: underline;
    }

    /* ── Responsive ── */
    @media (max-width: 1024px) {
      .main-grid {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 768px) {
      body {
        grid-template-columns: 1fr;
        grid-template-areas:
          "header"
          "main"
          "footer";
      }

      .sidebar {
        display: none;
        position: fixed;
        top: 0;
        left: 0;
        bottom: 0;
        width: var(--sidebar-width);
        z-index: 100;
        box-shadow: var(--shadow-lg);
      }

      .sidebar.open {
        display: flex;
      }

      .sidebar-overlay {
        display: none;
        position: fixed;
        inset: 0;
        background: rgba(0,0,0,0.5);
        z-index: 99;
      }

      .sidebar-overlay.open {
        display: block;
      }

      .mobile-toggle {
        display: block;
      }

      .main {
        padding: 16px;
      }

      .main-grid {
        grid-template-columns: 1fr;
        gap: 14px;
      }

      .header {
        padding: 0 16px;
      }

      .system-stats {
        grid-template-columns: 1fr;
      }

      .gauge-container {
        justify-content: center;
      }

      .system-info-grid {
        grid-template-columns: 1fr 1fr;
      }
    }

    @media (max-width: 480px) {
      .system-info-grid {
        grid-template-columns: 1fr;
      }

      .channel-right {
        flex-direction: column;
        align-items: flex-end;
        gap: 4px;
      }

      .header-right .uptime-badge {
        display: none;
      }
    }
  </style>
</head>
<body>
  <!-- Sidebar Overlay (mobile) -->
  <div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>

  <!-- Sidebar -->
  <nav class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">J</div>
      <span class="sidebar-logo-text">JalenClaw</span>
      <span class="sidebar-version">v0.1.0</span>
    </div>
    <div class="sidebar-nav">
      <div class="sidebar-section-label">Monitor</div>
      <a class="nav-item active" href="#">
        <span class="nav-icon">&#9636;</span>
        <span>Dashboard</span>
      </a>
      <a class="nav-item" href="#">
        <span class="nav-icon">&#8644;</span>
        <span>Channels</span>
      </a>
      <a class="nav-item" href="#">
        <span class="nav-icon">&#9881;</span>
        <span>Sessions</span>
      </a>
      <div class="sidebar-section-label">Config</div>
      <a class="nav-item" href="#">
        <span class="nav-icon">&#9881;</span>
        <span>Settings</span>
      </a>
    </div>
    <div class="sidebar-bottom">
      <div class="sidebar-bottom-info">
        Node <span id="node-version">--</span><br>
        PID <span id="pid-info" style="font-family: var(--mono);">--</span>
      </div>
    </div>
  </nav>

  <!-- Header -->
  <header class="header">
    <div class="header-left">
      <button class="mobile-toggle" onclick="toggleSidebar()">&#9776;</button>
      <div class="header-breadcrumb">
        <strong>Dashboard</strong> &mdash; Real-time monitoring
      </div>
    </div>
    <div class="header-right">
      <span class="last-updated" id="last-updated">updated just now</span>
      <span class="uptime-badge" id="uptime-badge">up --</span>
      <span class="conn-status" id="conn-status">
        <span class="conn-dot" id="ws-dot"></span>
        <span id="ws-label">connecting</span>
      </span>
    </div>
  </header>

  <!-- Main Content -->
  <main class="main">
    <div class="main-grid">

      <!-- System Status Card -->
      <div class="card card-full">
        <div class="card-header">
          <span class="card-title">System Status</span>
          <span class="card-badge" id="system-status-badge">healthy</span>
        </div>
        <div class="card-body">
          <div class="system-stats">
            <div class="gauge-container">
              <!-- CPU Gauge -->
              <div class="gauge">
                <svg viewBox="0 0 90 90">
                  <circle class="gauge-bg" cx="45" cy="45" r="36"/>
                  <circle class="gauge-fill cpu" id="cpu-gauge" cx="45" cy="45" r="36"
                    stroke-dasharray="226.19"
                    stroke-dashoffset="226.19"/>
                </svg>
                <div class="gauge-label">
                  <div class="gauge-value" id="cpu-value">0%</div>
                  <div class="gauge-caption">CPU</div>
                </div>
              </div>
              <!-- Memory Gauge -->
              <div class="gauge">
                <svg viewBox="0 0 90 90">
                  <circle class="gauge-bg" cx="45" cy="45" r="36"/>
                  <circle class="gauge-fill memory" id="mem-gauge" cx="45" cy="45" r="36"
                    stroke-dasharray="226.19"
                    stroke-dashoffset="226.19"/>
                </svg>
                <div class="gauge-label">
                  <div class="gauge-value" id="mem-value">0%</div>
                  <div class="gauge-caption">MEM</div>
                </div>
              </div>
            </div>
            <div class="system-info-grid">
              <div class="info-item">
                <div class="info-label">Uptime</div>
                <div class="info-value" id="sys-uptime">--</div>
              </div>
              <div class="info-item">
                <div class="info-label">Memory Used</div>
                <div class="info-value" id="sys-memory">--</div>
              </div>
              <div class="info-item">
                <div class="info-label">Node.js</div>
                <div class="info-value" id="sys-node">--</div>
              </div>
              <div class="info-item">
                <div class="info-label">Channels</div>
                <div class="info-value" id="sys-channels">0</div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Channels Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Channels</span>
          <span class="card-badge" id="channel-count">0</span>
        </div>
        <div class="card-body">
          <ul class="channel-list" id="channel-list">
            <li class="empty-state">
              <div class="empty-state-icon">&#8644;</div>
              No channels connected
            </li>
          </ul>
        </div>
      </div>

      <!-- Active Sessions Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Active Sessions</span>
          <span class="card-badge" id="session-count">0</span>
        </div>
        <div class="card-body">
          <div id="sessions-container">
            <div class="empty-state">
              <div class="empty-state-icon">&#9881;</div>
              No active sessions
            </div>
          </div>
        </div>
      </div>

      <!-- LLM Usage Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">LLM Usage</span>
          <span class="card-badge" id="llm-total-tokens">0 tokens</span>
        </div>
        <div class="card-body">
          <div class="llm-bars" id="llm-bars">
            <div class="empty-state">
              <div class="empty-state-icon">&#9733;</div>
              No LLM usage recorded
            </div>
          </div>
        </div>
      </div>

      <!-- Recent Messages Card -->
      <div class="card">
        <div class="card-header">
          <span class="card-title">Recent Messages</span>
          <span class="card-badge" id="msg-count-badge">0</span>
        </div>
        <div class="card-body" style="padding: 0;">
          <div class="message-feed" id="message-feed">
            <div class="empty-state" style="padding: 40px 16px;">
              <div class="empty-state-icon">&#9993;</div>
              Waiting for messages...
            </div>
          </div>
        </div>
      </div>
    </div>
  </main>

  <!-- Footer -->
  <footer class="footer">
    Powered by <strong>JalenClaw v0.1.0</strong> &middot;
    <a href="https://github.com/jalenclaw/jalenclaw" target="_blank" rel="noopener">GitHub</a>
  </footer>

  <script>
    // ── Config ──
    const API_KEY = new URLSearchParams(window.location.search).get("api_key") || "";
    const CIRCUMFERENCE = 2 * Math.PI * 36; // ~226.19
    let lastUpdateTime = Date.now();
    let messageCache = [];

    // ── Helpers ──
    function formatNum(n) {
      if (n == null) return "0";
      return Number(n).toLocaleString();
    }

    function formatBytes(bytes) {
      if (bytes == null || bytes === 0) return "0 B";
      if (typeof bytes === "string") return bytes;
      const units = ["B", "KB", "MB", "GB"];
      let i = 0;
      let val = bytes;
      while (val >= 1024 && i < units.length - 1) { val /= 1024; i++; }
      return val.toFixed(i > 0 ? 1 : 0) + " " + units[i];
    }

    function formatUptime(seconds) {
      if (seconds == null) return "--";
      seconds = Math.floor(seconds);
      var d = Math.floor(seconds / 86400);
      var h = Math.floor((seconds % 86400) / 3600);
      var m = Math.floor((seconds % 3600) / 60);
      var s = seconds % 60;
      if (d > 0) return d + "d " + h + "h " + m + "m";
      if (h > 0) return h + "h " + m + "m " + s + "s";
      if (m > 0) return m + "m " + s + "s";
      return s + "s";
    }

    function timeAgo(ts) {
      if (!ts) return "--";
      var diff = Math.floor((Date.now() - new Date(ts).getTime()) / 1000);
      if (diff < 0) diff = 0;
      if (diff < 5) return "just now";
      if (diff < 60) return diff + "s ago";
      if (diff < 3600) return Math.floor(diff / 60) + "m ago";
      if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
      return Math.floor(diff / 86400) + "d ago";
    }

    function formatTime(ts) {
      var d = new Date(ts);
      return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    function escHtml(str) {
      if (!str) return "";
      return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
    }

    function truncate(str, len) {
      if (!str) return "--";
      str = String(str);
      return str.length > len ? str.substring(0, len) + "..." : str;
    }

    function providerClass(name) {
      var n = (name || "").toLowerCase();
      if (n.includes("openai") || n.includes("gpt")) return "openai";
      if (n.includes("anthropic") || n.includes("claude")) return "anthropic";
      if (n.includes("google") || n.includes("gemini")) return "google";
      return "default";
    }

    // ── API ──
    async function fetchJSON(endpoint) {
      var headers = {};
      if (API_KEY) headers["X-Api-Key"] = API_KEY;
      var res = await fetch(endpoint, { headers: headers });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }

    // ── Gauge Update ──
    function setGauge(elementId, percent) {
      percent = Math.max(0, Math.min(100, percent || 0));
      var offset = CIRCUMFERENCE - (percent / 100) * CIRCUMFERENCE;
      document.getElementById(elementId).style.strokeDashoffset = offset;
    }

    // ── Render: System Status ──
    function renderSystem(data) {
      // CPU gauge
      var cpuPct = data.cpuUsage || 0;
      setGauge("cpu-gauge", cpuPct);
      document.getElementById("cpu-value").textContent = Math.round(cpuPct) + "%";

      // Memory gauge
      var memMB = 0;
      var memPct = 0;
      if (typeof data.memoryUsage === "number") {
        memMB = data.memoryUsage;
      } else if (typeof data.memoryUsage === "string") {
        memMB = parseFloat(data.memoryUsage) || 0;
      } else if (data.memoryUsage && data.memoryUsage.heapUsed) {
        memMB = data.memoryUsage.heapUsed / (1024 * 1024);
      }
      // Estimate percentage: assume ~512MB heap max if not provided
      var heapTotal = (data.memoryUsage && data.memoryUsage.heapTotal) || 512 * 1024 * 1024;
      if (typeof heapTotal === "number" && heapTotal > 1024) {
        memPct = (memMB * 1024 * 1024 / heapTotal) * 100;
      } else {
        memPct = (memMB / 512) * 100;
      }
      memPct = Math.min(memPct, 100);
      setGauge("mem-gauge", memPct);
      document.getElementById("mem-value").textContent = Math.round(memPct) + "%";

      // Info
      document.getElementById("sys-uptime").textContent = formatUptime(data.uptime);
      document.getElementById("sys-memory").textContent = memMB >= 1 ? memMB.toFixed(1) + " MB" : formatBytes(memMB);
      document.getElementById("sys-node").textContent = data.nodeVersion || data.node || process.version || "--";
      document.getElementById("sys-channels").textContent = (data.channels || []).length;

      // Header
      document.getElementById("uptime-badge").textContent = "up " + formatUptime(data.uptime);
      document.getElementById("node-version").textContent = data.nodeVersion || data.node || "--";
      document.getElementById("pid-info").textContent = data.pid || "--";

      lastUpdateTime = Date.now();
    }

    // ── Render: Channels ──
    function renderChannels(data) {
      var channels = Array.isArray(data) ? data : (data.channels || []);
      var container = document.getElementById("channel-list");
      document.getElementById("channel-count").textContent = channels.length;

      if (channels.length === 0) {
        container.innerHTML = '<li class="empty-state"><div class="empty-state-icon">&#8644;</div>No channels connected</li>';
        return;
      }

      container.innerHTML = channels.map(function(ch) {
        var status = ch.status || "disconnected";
        return '<li class="channel-item">' +
          '<div class="channel-left">' +
            '<span class="status-dot ' + escHtml(status) + '"></span>' +
            '<span class="channel-name">' + escHtml(ch.name || ch.id || "unknown") + '</span>' +
            '<span class="status-badge ' + escHtml(status) + '">' + escHtml(status) + '</span>' +
          '</div>' +
          '<div class="channel-right">' +
            '<span class="channel-msgs">' + formatNum(ch.messageCount || ch.messages || 0) + ' msgs</span>' +
            '<span class="channel-time">' + timeAgo(ch.lastActivity || ch.lastMessage) + '</span>' +
          '</div>' +
        '</li>';
      }).join("");
    }

    // ── Render: Sessions ──
    function renderSessions(data) {
      var sessions = Array.isArray(data) ? data : (data.sessions || []);
      var container = document.getElementById("sessions-container");
      document.getElementById("session-count").textContent = sessions.length;

      if (sessions.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9881;</div>No active sessions</div>';
        return;
      }

      var html = '<table class="sessions-table"><thead><tr>' +
        '<th>Group ID</th><th>Messages</th><th>Last Active</th><th>Provider</th>' +
        '</tr></thead><tbody>';

      html += sessions.map(function(s) {
        var pClass = providerClass(s.provider || "");
        return '<tr>' +
          '<td class="mono">' + escHtml(truncate(s.groupId || s.id || "--", 20)) + '</td>' +
          '<td class="mono">' + formatNum(s.messageCount || s.messages || 0) + '</td>' +
          '<td>' + timeAgo(s.lastActive || s.lastActivity || s.updatedAt) + '</td>' +
          '<td><span class="provider-tag ' + pClass + '">' + escHtml(s.provider || "--") + '</span></td>' +
        '</tr>';
      }).join("");

      html += '</tbody></table>';
      container.innerHTML = html;
    }

    // ── Render: LLM Usage ──
    function renderLLMUsage(data) {
      var usage = data.llmUsage || data.llm || data;
      if (!usage || typeof usage !== "object") return;

      var providers = Object.entries(usage);
      var container = document.getElementById("llm-bars");

      if (providers.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9733;</div>No LLM usage recorded</div>';
        document.getElementById("llm-total-tokens").textContent = "0 tokens";
        return;
      }

      var maxTokens = Math.max.apply(null, providers.map(function(p) { return p[1].tokens || 0; }));
      var totalTokens = providers.reduce(function(sum, p) { return sum + (p[1].tokens || 0); }, 0);
      document.getElementById("llm-total-tokens").textContent = formatNum(totalTokens) + " tokens";

      container.innerHTML = providers.map(function(entry) {
        var name = entry[0];
        var info = entry[1];
        var tokens = info.tokens || 0;
        var requests = info.requests || 0;
        var pct = maxTokens > 0 ? Math.round((tokens / maxTokens) * 100) : 0;
        var cls = providerClass(name);

        return '<div class="llm-bar-row">' +
          '<div class="llm-bar-header">' +
            '<span class="llm-bar-name">' + escHtml(name) + '</span>' +
            '<span class="llm-bar-stats">' + formatNum(tokens) + ' tokens</span>' +
          '</div>' +
          '<div class="llm-bar-track">' +
            '<div class="llm-bar-fill ' + cls + '" style="width: ' + pct + '%"></div>' +
          '</div>' +
          '<div class="llm-bar-detail">' +
            '<span>' + formatNum(requests) + ' requests</span>' +
            '<span>' + (requests > 0 ? formatNum(Math.round(tokens / requests)) + ' avg tokens/req' : '') + '</span>' +
          '</div>' +
        '</div>';
      }).join("");
    }

    // ── Render: Messages ──
    function renderMessages(messages) {
      var feed = document.getElementById("message-feed");
      var list = Array.isArray(messages) ? messages : [];
      document.getElementById("msg-count-badge").textContent = list.length;

      if (list.length === 0) {
        feed.innerHTML = '<div class="empty-state" style="padding: 40px 16px;"><div class="empty-state-icon">&#9993;</div>Waiting for messages...</div>';
        return;
      }

      feed.innerHTML = list.map(function(msg) {
        var dir = msg.direction || "inbound";
        var arrow = dir === "inbound" ? "\u2192" : "\u2190";
        var preview = truncate(msg.preview || msg.content || msg.text || "", 100);
        return '<div class="msg-row">' +
          '<span class="msg-time">' + timeAgo(msg.timestamp) + '</span>' +
          '<span class="msg-dir ' + dir + '">' + arrow + '</span>' +
          '<span class="msg-channel-badge">' + escHtml(msg.channel || "--") + '</span>' +
          '<span class="msg-preview">' + escHtml(preview) + '</span>' +
        '</div>';
      }).join("");

      feed.scrollTop = feed.scrollHeight;
    }

    // ── "Last updated" ticker ──
    function updateLastUpdated() {
      var diff = Math.floor((Date.now() - lastUpdateTime) / 1000);
      var el = document.getElementById("last-updated");
      if (diff < 3) {
        el.textContent = "updated just now";
      } else {
        el.textContent = "updated " + diff + "s ago";
      }
    }

    // ── Data Fetching ──
    async function fetchStatus() {
      try {
        var data = await fetchJSON("/api/status");
        renderSystem(data);
        // Status endpoint often includes channels and LLM usage
        if (data.channels) renderChannels(data);
        if (data.llmUsage || data.llm) renderLLMUsage(data);
        if (data.sessions) renderSessions(data);
      } catch (e) {
        console.error("Status fetch failed:", e);
      }
    }

    async function fetchChannels() {
      try {
        var data = await fetchJSON("/api/channels");
        renderChannels(data);
      } catch (e) {
        // Channels may be embedded in status, ignore
      }
    }

    async function fetchSessions() {
      try {
        var data = await fetchJSON("/api/sessions");
        renderSessions(data);
      } catch (e) {
        // Sessions may be embedded in status, ignore
      }
    }

    async function fetchMessages() {
      try {
        var data = await fetchJSON("/api/messages/recent");
        var list = Array.isArray(data) ? data : (data.messages || []);
        renderMessages(list);
      } catch (e) {
        // Ignore silently
      }
    }

    // ── WebSocket ──
    function connectWS() {
      var proto = location.protocol === "https:" ? "wss:" : "ws:";
      var wsUrl = proto + "//" + location.host + "?api_key=" + encodeURIComponent(API_KEY);
      var dot = document.getElementById("ws-dot");
      var label = document.getElementById("ws-label");
      var badge = document.getElementById("conn-status");
      var ws;

      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        dot.className = "conn-dot dead";
        label.textContent = "error";
        badge.className = "conn-status";
        return;
      }

      ws.onopen = function() {
        dot.className = "conn-dot live";
        label.textContent = "live";
        badge.className = "conn-status live";
      };

      ws.onclose = function() {
        dot.className = "conn-dot dead";
        label.textContent = "disconnected";
        badge.className = "conn-status";
        setTimeout(connectWS, 3000);
      };

      ws.onerror = function() {
        dot.className = "conn-dot dead";
        label.textContent = "error";
        badge.className = "conn-status";
      };

      ws.onmessage = function(event) {
        try {
          var msg = JSON.parse(event.data);
          if (msg.type === "message") {
            var feed = document.getElementById("message-feed");
            var empty = feed.querySelector(".empty-state");
            if (empty) feed.innerHTML = "";

            var dir = msg.direction || "inbound";
            var arrow = dir === "inbound" ? "\u2192" : "\u2190";
            var preview = truncate(msg.preview || msg.content || msg.text || "", 100);

            var row = document.createElement("div");
            row.className = "msg-row new";
            row.innerHTML =
              '<span class="msg-time">' + timeAgo(msg.timestamp || Date.now()) + '</span>' +
              '<span class="msg-dir ' + dir + '">' + arrow + '</span>' +
              '<span class="msg-channel-badge">' + escHtml(msg.channel || "--") + '</span>' +
              '<span class="msg-preview">' + escHtml(preview) + '</span>';

            feed.appendChild(row);

            // Keep max 50 messages
            while (feed.children.length > 50) {
              feed.removeChild(feed.firstChild);
            }

            feed.scrollTop = feed.scrollHeight;

            // Update count
            var badge = document.getElementById("msg-count-badge");
            badge.textContent = feed.children.length;
          }
        } catch (e) { /* ignore non-JSON */ }
      };
    }

    // ── Sidebar Toggle (mobile) ──
    function toggleSidebar() {
      document.getElementById("sidebar").classList.toggle("open");
      document.getElementById("sidebar-overlay").classList.toggle("open");
    }

    // ── Initialize ──
    (function init() {
      // Initial fetch
      fetchStatus();
      fetchMessages();

      // Polling intervals
      setInterval(fetchStatus, 3000);
      setInterval(fetchChannels, 5000);
      setInterval(fetchSessions, 5000);
      setInterval(fetchMessages, 3000);
      setInterval(updateLastUpdated, 1000);

      // WebSocket
      connectWS();
    })();
  </script>
</body>
</html>
`;
