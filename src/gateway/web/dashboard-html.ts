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
      grid-template-rows: var(--header-height) 1fr;
      grid-template-areas:
        "sidebar header"
        "sidebar main";
    }

    /* ---- Header ---- */
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
    .header-left { display: flex; align-items: center; gap: 16px; }
    .header-breadcrumb { font-size: 14px; color: var(--text-secondary); }
    .header-breadcrumb strong { color: var(--text-primary); }
    .header-right { display: flex; align-items: center; gap: 20px; }
    .last-updated { font-size: 12px; color: var(--text-muted); font-family: var(--mono); }
    .conn-status {
      display: inline-flex; align-items: center; gap: 8px;
      font-size: 12px; font-weight: 500; padding: 4px 12px;
      border-radius: 20px; background: var(--bg-input);
      border: 1px solid var(--border); transition: all 0.3s ease;
    }
    .conn-status.live { border-color: rgba(34,197,94,0.3); background: var(--green-dim); }
    .conn-dot {
      width: 7px; height: 7px; border-radius: 50%;
      background: var(--text-muted); transition: all 0.3s ease;
    }
    .conn-dot.live { background: var(--green); box-shadow: 0 0 8px var(--green); animation: pulse 2s infinite; }
    .conn-dot.dead { background: var(--red); box-shadow: 0 0 6px var(--red); }
    @keyframes pulse { 0%,100%{opacity:1}50%{opacity:0.5} }
    .uptime-badge {
      font-family: var(--mono); font-size: 12px; color: var(--text-secondary);
      background: var(--bg-input); border: 1px solid var(--border);
      padding: 4px 10px; border-radius: 6px;
    }

    /* ---- Sidebar ---- */
    .sidebar {
      grid-area: sidebar; background: var(--bg-sidebar);
      border-right: 1px solid var(--border);
      display: flex; flex-direction: column; z-index: 20;
    }
    .sidebar-logo {
      height: var(--header-height); display: flex; align-items: center;
      padding: 0 20px; border-bottom: 1px solid var(--border); gap: 10px;
    }
    .sidebar-logo-icon {
      width: 28px; height: 28px; border-radius: 6px;
      background: linear-gradient(135deg, var(--accent), #818cf8);
      display: flex; align-items: center; justify-content: center;
      font-weight: 800; font-size: 14px; color: #fff; flex-shrink: 0;
    }
    .sidebar-logo-text { font-size: 16px; font-weight: 700; letter-spacing: -0.3px; }
    .sidebar-version {
      font-size: 10px; color: var(--text-muted); font-family: var(--mono);
      background: var(--bg-input); padding: 1px 6px; border-radius: 4px; margin-left: auto;
    }
    .sidebar-nav { padding: 12px 10px; flex: 1; }
    .sidebar-section-label {
      font-size: 10px; font-weight: 600; text-transform: uppercase;
      letter-spacing: 1px; color: var(--text-muted); padding: 12px 10px 6px;
    }
    .nav-item {
      display: flex; align-items: center; gap: 10px;
      padding: 9px 12px; border-radius: 6px; font-size: 13px;
      font-weight: 500; color: var(--text-secondary); cursor: pointer;
      transition: all 0.15s ease; text-decoration: none; user-select: none;
    }
    .nav-item:hover { background: rgba(255,255,255,0.04); color: var(--text-primary); }
    .nav-item.active { background: var(--accent-dim); color: var(--accent); }
    .nav-icon { width: 18px; height: 18px; display: flex; align-items: center; justify-content: center; font-size: 14px; opacity: 0.8; }
    .sidebar-bottom { padding: 12px 16px; border-top: 1px solid var(--border); }
    .sidebar-bottom-info { font-size: 11px; color: var(--text-muted); line-height: 1.6; }

    .mobile-toggle { display: none; background: none; border: none; color: var(--text-primary); font-size: 20px; cursor: pointer; padding: 4px; }

    /* ---- Main ---- */
    .main { grid-area: main; overflow-y: auto; overflow-x: hidden; }
    .view { display: none; height: 100%; }
    .view.active { display: flex; flex-direction: column; }

    /* ---- Cards (shared) ---- */
    .view-padded { padding: 24px 28px; }
    .main-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; max-width: 1400px; }
    .card {
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: var(--radius-lg); box-shadow: var(--shadow);
      overflow: hidden; transition: border-color 0.2s ease;
    }
    .card:hover { border-color: var(--border-light); }
    .card-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 16px 20px; border-bottom: 1px solid var(--border);
    }
    .card-title { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-secondary); }
    .card-badge { font-size: 11px; font-family: var(--mono); padding: 2px 8px; border-radius: 10px; background: var(--accent-dim); color: var(--accent); }
    .card-body { padding: 20px; }
    .card-full { grid-column: 1 / -1; }

    /* ---- System Gauges ---- */
    .system-stats { display: grid; grid-template-columns: auto 1fr; gap: 24px; align-items: center; }
    .gauge-container { display: flex; gap: 20px; }
    .gauge { position: relative; width: 90px; height: 90px; }
    .gauge svg { transform: rotate(-90deg); width: 90px; height: 90px; }
    .gauge-bg { fill: none; stroke: var(--bg-input); stroke-width: 8; }
    .gauge-fill { fill: none; stroke-width: 8; stroke-linecap: round; transition: stroke-dashoffset 0.6s ease; }
    .gauge-fill.cpu { stroke: var(--accent); }
    .gauge-fill.memory { stroke: var(--purple); }
    .gauge-label { position: absolute; top: 50%; left: 50%; transform: translate(-50%,-50%); text-align: center; }
    .gauge-value { font-family: var(--mono); font-size: 16px; font-weight: 700; line-height: 1; }
    .gauge-caption { font-size: 9px; color: var(--text-muted); text-transform: uppercase; letter-spacing: 0.5px; margin-top: 2px; }
    .system-info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .info-item { background: var(--bg-input); border-radius: 6px; padding: 10px 14px; }
    .info-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); margin-bottom: 4px; }
    .info-value { font-family: var(--mono); font-size: 14px; font-weight: 600; }

    /* ---- Channel list ---- */
    .channel-list { list-style: none; }
    .channel-item { display: flex; align-items: center; justify-content: space-between; padding: 12px 0; border-bottom: 1px solid var(--border); }
    .channel-item:last-child { border-bottom: none; padding-bottom: 0; }
    .channel-item:first-child { padding-top: 0; }
    .channel-left { display: flex; align-items: center; gap: 12px; }
    .status-dot { width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; }
    .status-dot.connected { background: var(--green); box-shadow: 0 0 6px var(--green); }
    .status-dot.disconnected { background: var(--red); box-shadow: 0 0 6px var(--red); }
    .status-dot.starting,.status-dot.connecting { background: var(--yellow); box-shadow: 0 0 6px var(--yellow); animation: pulse 1.5s infinite; }
    .channel-name { font-size: 14px; font-weight: 500; }
    .channel-right { display: flex; align-items: center; gap: 16px; text-align: right; }
    .channel-msgs { font-family: var(--mono); font-size: 12px; color: var(--text-secondary); }
    .channel-time { font-size: 11px; color: var(--text-muted); min-width: 70px; text-align: right; }
    .status-badge { display: inline-block; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; padding: 2px 8px; border-radius: 4px; }
    .status-badge.connected { background: var(--green-dim); color: var(--green); }
    .status-badge.disconnected { background: var(--red-dim); color: var(--red); }
    .status-badge.starting,.status-badge.connecting { background: var(--yellow-dim); color: var(--yellow); }

    /* ---- Toggle switch (visual) ---- */
    .toggle-switch { position: relative; width: 36px; height: 20px; cursor: pointer; }
    .toggle-switch input { display: none; }
    .toggle-track { position: absolute; inset: 0; background: var(--border); border-radius: 10px; transition: background 0.2s; }
    .toggle-switch input:checked + .toggle-track { background: var(--accent); }
    .toggle-knob { position: absolute; top: 2px; left: 2px; width: 16px; height: 16px; border-radius: 50%; background: #fff; transition: transform 0.2s; }
    .toggle-switch input:checked ~ .toggle-knob { transform: translateX(16px); }

    /* ---- Sessions table ---- */
    .sessions-table { width: 100%; border-collapse: collapse; font-size: 13px; }
    .sessions-table th { text-align: left; font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.8px; color: var(--text-muted); padding: 0 12px 10px 0; border-bottom: 1px solid var(--border); }
    .sessions-table td { padding: 10px 12px 10px 0; border-bottom: 1px solid var(--border); vertical-align: middle; }
    .sessions-table tr:last-child td { border-bottom: none; }
    .sessions-table .mono { font-family: var(--mono); font-size: 12px; }
    .provider-tag { display: inline-block; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px; background: var(--accent-dim); color: var(--accent); text-transform: uppercase; letter-spacing: 0.3px; }
    .provider-tag.openai { background: var(--green-dim); color: var(--green); }
    .provider-tag.anthropic { background: rgba(167,139,250,0.15); color: var(--purple); }
    .provider-tag.google { background: var(--yellow-dim); color: var(--yellow); }

    /* ---- LLM bars ---- */
    .llm-bars { display: flex; flex-direction: column; gap: 16px; }
    .llm-bar-row { display: flex; flex-direction: column; gap: 6px; }
    .llm-bar-header { display: flex; justify-content: space-between; align-items: baseline; }
    .llm-bar-name { font-size: 13px; font-weight: 600; }
    .llm-bar-stats { font-size: 12px; font-family: var(--mono); color: var(--text-secondary); }
    .llm-bar-track { height: 10px; background: var(--bg-input); border-radius: 5px; overflow: hidden; }
    .llm-bar-fill { height: 100%; border-radius: 5px; transition: width 0.5s ease; min-width: 2px; }
    .llm-bar-fill.openai { background: linear-gradient(90deg,#22c55e,#4ade80); }
    .llm-bar-fill.anthropic { background: linear-gradient(90deg,#a78bfa,#c4b5fd); }
    .llm-bar-fill.google { background: linear-gradient(90deg,#eab308,#facc15); }
    .llm-bar-fill.default { background: linear-gradient(90deg,var(--accent),#818cf8); }
    .llm-bar-detail { display: flex; gap: 16px; font-size: 11px; color: var(--text-muted); }

    /* ---- Message feed ---- */
    .message-feed { max-height: 400px; overflow-y: auto; font-family: var(--mono); font-size: 12px; }
    .message-feed::-webkit-scrollbar { width: 5px; }
    .message-feed::-webkit-scrollbar-track { background: transparent; }
    .message-feed::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .msg-row { display: flex; align-items: baseline; gap: 10px; padding: 6px 8px; border-bottom: 1px solid rgba(42,45,58,0.5); transition: background 0.1s ease; }
    .msg-row:hover { background: var(--bg-card-hover); }
    .msg-row.new { animation: fadeIn 0.3s ease; }
    @keyframes fadeIn { from{opacity:0;transform:translateY(-4px)} to{opacity:1;transform:translateY(0)} }
    .msg-time { color: var(--text-muted); flex-shrink: 0; min-width: 60px; font-size: 11px; }
    .msg-dir { flex-shrink: 0; width: 18px; text-align: center; font-weight: 700; font-size: 13px; }
    .msg-dir.inbound { color: var(--green); }
    .msg-dir.outbound { color: var(--blue); }
    .msg-channel-badge { flex-shrink: 0; font-size: 10px; font-weight: 600; padding: 1px 7px; border-radius: 3px; background: rgba(99,102,241,0.12); color: var(--accent); text-transform: uppercase; letter-spacing: 0.3px; }
    .msg-preview { color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0; }

    /* ---- Empty state ---- */
    .empty-state { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 13px; }
    .empty-state-icon { font-size: 28px; margin-bottom: 8px; opacity: 0.4; }

    /* ---- Settings ---- */
    .settings-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .settings-section { background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg); padding: 20px; }
    .settings-section h3 { font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.6px; color: var(--text-secondary); margin-bottom: 16px; }
    .settings-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid var(--border); font-size: 13px; }
    .settings-row:last-child { border-bottom: none; }
    .settings-key { color: var(--text-secondary); }
    .settings-val { font-family: var(--mono); font-weight: 500; }

    /* ==== WebChat ==== */
    .chat-container { display: flex; flex-direction: column; height: 100%; }
    .chat-header {
      display: flex; align-items: center; justify-content: space-between;
      padding: 12px 20px; border-bottom: 1px solid var(--border);
      background: var(--bg-card); flex-shrink: 0;
    }
    .chat-header-left { display: flex; align-items: center; gap: 12px; }
    .chat-title { font-size: 15px; font-weight: 600; }
    .chat-session-select {
      font-family: var(--sans); font-size: 12px;
      background: var(--bg-input); color: var(--text-primary);
      border: 1px solid var(--border); border-radius: 6px;
      padding: 4px 8px; outline: none;
    }
    .chat-messages {
      flex: 1; overflow-y: auto; padding: 20px;
      display: flex; flex-direction: column; gap: 12px;
    }
    .chat-messages::-webkit-scrollbar { width: 6px; }
    .chat-messages::-webkit-scrollbar-track { background: transparent; }
    .chat-messages::-webkit-scrollbar-thumb { background: var(--border); border-radius: 3px; }
    .chat-bubble {
      max-width: 75%; padding: 10px 16px; border-radius: 16px;
      font-size: 14px; line-height: 1.55; word-wrap: break-word;
      animation: fadeIn 0.2s ease;
    }
    .chat-bubble.user {
      align-self: flex-end; background: var(--accent);
      color: #fff; border-bottom-right-radius: 4px;
    }
    .chat-bubble.assistant {
      align-self: flex-start; background: var(--bg-card);
      border: 1px solid var(--border); border-bottom-left-radius: 4px;
    }
    .chat-bubble pre {
      background: var(--bg-input); border-radius: 6px; padding: 10px 12px;
      margin: 8px 0; overflow-x: auto; font-family: var(--mono); font-size: 12px;
      border: 1px solid var(--border);
    }
    .chat-bubble code {
      font-family: var(--mono); font-size: 12px;
      background: rgba(99,102,241,0.12); padding: 1px 5px; border-radius: 3px;
    }
    .chat-bubble pre code { background: none; padding: 0; }
    .chat-typing {
      align-self: flex-start; padding: 10px 16px;
      background: var(--bg-card); border: 1px solid var(--border);
      border-radius: 16px; border-bottom-left-radius: 4px;
      display: none; gap: 5px; align-items: center;
    }
    .chat-typing.visible { display: flex; }
    .typing-dot {
      width: 6px; height: 6px; border-radius: 50%;
      background: var(--text-muted); animation: typingBounce 1.4s infinite ease-in-out;
    }
    .typing-dot:nth-child(2) { animation-delay: 0.2s; }
    .typing-dot:nth-child(3) { animation-delay: 0.4s; }
    @keyframes typingBounce { 0%,80%,100%{transform:translateY(0)}40%{transform:translateY(-6px)} }

    .chat-input-area {
      padding: 16px 20px; border-top: 1px solid var(--border);
      background: var(--bg-card); display: flex; gap: 12px;
      align-items: flex-end; flex-shrink: 0;
    }
    .chat-input {
      flex: 1; resize: none; background: var(--bg-input);
      border: 1px solid var(--border); border-radius: 12px;
      padding: 10px 16px; color: var(--text-primary);
      font-family: var(--sans); font-size: 14px; line-height: 1.4;
      outline: none; max-height: 120px; min-height: 42px;
      transition: border-color 0.2s;
    }
    .chat-input:focus { border-color: var(--accent); }
    .chat-input::placeholder { color: var(--text-muted); }
    .chat-send {
      width: 42px; height: 42px; border-radius: 50%;
      background: var(--accent); border: none; color: #fff;
      font-size: 18px; cursor: pointer; display: flex;
      align-items: center; justify-content: center;
      transition: background 0.15s, opacity 0.15s;
      flex-shrink: 0;
    }
    .chat-send:hover { background: #4f46e5; }
    .chat-send:disabled { opacity: 0.4; cursor: not-allowed; }
    .chat-empty {
      flex: 1; display: flex; align-items: center; justify-content: center;
      color: var(--text-muted); flex-direction: column; gap: 8px;
    }
    .chat-empty-icon { font-size: 36px; opacity: 0.3; }

    /* ---- Responsive ---- */
    @media (max-width:1024px) { .main-grid,.settings-grid { grid-template-columns: 1fr; } }
    @media (max-width:768px) {
      body { grid-template-columns: 1fr; grid-template-areas: "header" "main"; }
      .sidebar { display: none; position: fixed; top: 0; left: 0; bottom: 0; width: var(--sidebar-width); z-index: 100; box-shadow: var(--shadow-lg); }
      .sidebar.open { display: flex; }
      .sidebar-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.5); z-index: 99; }
      .sidebar-overlay.open { display: block; }
      .mobile-toggle { display: block; }
      .main { padding: 0; }
      .view-padded { padding: 16px; }
      .main-grid,.settings-grid { grid-template-columns: 1fr; gap: 14px; }
      .header { padding: 0 16px; }
      .system-stats { grid-template-columns: 1fr; }
      .gauge-container { justify-content: center; }
      .system-info-grid { grid-template-columns: 1fr 1fr; }
    }
    @media (max-width:480px) {
      .system-info-grid { grid-template-columns: 1fr; }
      .channel-right { flex-direction: column; align-items: flex-end; gap: 4px; }
      .header-right .uptime-badge { display: none; }
    }
  </style>
</head>
<body>
  <div class="sidebar-overlay" id="sidebar-overlay" onclick="toggleSidebar()"></div>

  <nav class="sidebar" id="sidebar">
    <div class="sidebar-logo">
      <div class="sidebar-logo-icon">J</div>
      <span class="sidebar-logo-text">JalenClaw</span>
      <span class="sidebar-version">v0.1.0</span>
    </div>
    <div class="sidebar-nav">
      <div class="sidebar-section-label">Monitor</div>
      <a class="nav-item active" data-view="dashboard" onclick="switchView('dashboard')">
        <span class="nav-icon">&#9636;</span><span>Dashboard</span>
      </a>
      <a class="nav-item" data-view="webchat" onclick="switchView('webchat')">
        <span class="nav-icon">&#9993;</span><span>WebChat</span>
      </a>
      <a class="nav-item" data-view="channels" onclick="switchView('channels')">
        <span class="nav-icon">&#8644;</span><span>Channels</span>
      </a>
      <a class="nav-item" data-view="sessions" onclick="switchView('sessions')">
        <span class="nav-icon">&#9783;</span><span>Sessions</span>
      </a>
      <div class="sidebar-section-label">Config</div>
      <a class="nav-item" data-view="settings" onclick="switchView('settings')">
        <span class="nav-icon">&#9881;</span><span>Settings</span>
      </a>
    </div>
    <div class="sidebar-bottom">
      <div class="sidebar-bottom-info">
        Node <span id="node-version">--</span><br>
        PID <span id="pid-info" style="font-family:var(--mono);">--</span>
      </div>
    </div>
  </nav>

  <header class="header">
    <div class="header-left">
      <button class="mobile-toggle" onclick="toggleSidebar()">&#9776;</button>
      <div class="header-breadcrumb">
        <strong id="breadcrumb-title">Dashboard</strong>
        <span id="breadcrumb-sub"> &mdash; Real-time monitoring</span>
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

  <main class="main">
    <!-- ======== DASHBOARD VIEW ======== -->
    <section class="view active" id="view-dashboard">
      <div class="view-padded">
        <div class="main-grid">
          <div class="card card-full">
            <div class="card-header">
              <span class="card-title">System Status</span>
              <span class="card-badge" id="system-status-badge">healthy</span>
            </div>
            <div class="card-body">
              <div class="system-stats">
                <div class="gauge-container">
                  <div class="gauge">
                    <svg viewBox="0 0 90 90">
                      <circle class="gauge-bg" cx="45" cy="45" r="36"/>
                      <circle class="gauge-fill cpu" id="cpu-gauge" cx="45" cy="45" r="36" stroke-dasharray="226.19" stroke-dashoffset="226.19"/>
                    </svg>
                    <div class="gauge-label">
                      <div class="gauge-value" id="cpu-value">0%</div>
                      <div class="gauge-caption">CPU</div>
                    </div>
                  </div>
                  <div class="gauge">
                    <svg viewBox="0 0 90 90">
                      <circle class="gauge-bg" cx="45" cy="45" r="36"/>
                      <circle class="gauge-fill memory" id="mem-gauge" cx="45" cy="45" r="36" stroke-dasharray="226.19" stroke-dashoffset="226.19"/>
                    </svg>
                    <div class="gauge-label">
                      <div class="gauge-value" id="mem-value">0%</div>
                      <div class="gauge-caption">MEM</div>
                    </div>
                  </div>
                </div>
                <div class="system-info-grid">
                  <div class="info-item"><div class="info-label">Uptime</div><div class="info-value" id="sys-uptime">--</div></div>
                  <div class="info-item"><div class="info-label">Memory Used</div><div class="info-value" id="sys-memory">--</div></div>
                  <div class="info-item"><div class="info-label">Node.js</div><div class="info-value" id="sys-node">--</div></div>
                  <div class="info-item"><div class="info-label">Channels</div><div class="info-value" id="sys-channels">0</div></div>
                </div>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">Channels</span>
              <span class="card-badge" id="dash-channel-count">0</span>
            </div>
            <div class="card-body">
              <ul class="channel-list" id="dash-channel-list">
                <li class="empty-state"><div class="empty-state-icon">&#8644;</div>No channels connected</li>
              </ul>
            </div>
          </div>

          <div class="card">
            <div class="card-header">
              <span class="card-title">LLM Usage</span>
              <span class="card-badge" id="llm-total-tokens">0 tokens</span>
            </div>
            <div class="card-body">
              <div class="llm-bars" id="llm-bars">
                <div class="empty-state"><div class="empty-state-icon">&#9733;</div>No LLM usage recorded</div>
              </div>
            </div>
          </div>

          <div class="card card-full">
            <div class="card-header">
              <span class="card-title">Recent Messages</span>
              <span class="card-badge" id="msg-count-badge">0</span>
            </div>
            <div class="card-body" style="padding:0;">
              <div class="message-feed" id="message-feed">
                <div class="empty-state" style="padding:40px 16px;">
                  <div class="empty-state-icon">&#9993;</div>Waiting for messages...
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ======== WEBCHAT VIEW ======== -->
    <section class="view" id="view-webchat">
      <div class="chat-container">
        <div class="chat-header">
          <div class="chat-header-left">
            <span class="chat-title">WebChat</span>
          </div>
          <select class="chat-session-select" id="chat-session-select">
            <option value="">New session</option>
          </select>
        </div>
        <div class="chat-messages" id="chat-messages">
          <div class="chat-empty">
            <div class="chat-empty-icon">&#9993;</div>
            <span>Send a message to start chatting</span>
          </div>
        </div>
        <div class="chat-typing" id="chat-typing">
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
          <div class="typing-dot"></div>
        </div>
        <div class="chat-input-area">
          <textarea class="chat-input" id="chat-input" placeholder="Type a message..." rows="1"></textarea>
          <button class="chat-send" id="chat-send" title="Send">&#10148;</button>
        </div>
      </div>
    </section>

    <!-- ======== CHANNELS VIEW ======== -->
    <section class="view" id="view-channels">
      <div class="view-padded">
        <div class="card">
          <div class="card-header">
            <span class="card-title">All Channels</span>
            <span class="card-badge" id="channels-view-count">0</span>
          </div>
          <div class="card-body">
            <ul class="channel-list" id="channels-view-list">
              <li class="empty-state"><div class="empty-state-icon">&#8644;</div>No channels configured</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <!-- ======== SESSIONS VIEW ======== -->
    <section class="view" id="view-sessions">
      <div class="view-padded">
        <div class="card">
          <div class="card-header">
            <span class="card-title">Active Sessions</span>
            <span class="card-badge" id="sessions-view-count">0</span>
          </div>
          <div class="card-body">
            <div id="sessions-view-container">
              <div class="empty-state"><div class="empty-state-icon">&#9783;</div>No active sessions</div>
            </div>
          </div>
        </div>
      </div>
    </section>

    <!-- ======== SETTINGS VIEW ======== -->
    <section class="view" id="view-settings">
      <div class="view-padded">
        <div class="settings-grid" id="settings-grid">
          <div class="settings-section">
            <h3>Gateway</h3>
            <div id="settings-gateway"><div class="settings-row"><span class="settings-key">Loading...</span></div></div>
          </div>
          <div class="settings-section">
            <h3>Provider</h3>
            <div id="settings-provider"><div class="settings-row"><span class="settings-key">Loading...</span></div></div>
          </div>
          <div class="settings-section">
            <h3>Memory</h3>
            <div id="settings-memory"><div class="settings-row"><span class="settings-key">Loading...</span></div></div>
          </div>
          <div class="settings-section">
            <h3>System</h3>
            <div id="settings-system"><div class="settings-row"><span class="settings-key">Loading...</span></div></div>
          </div>
        </div>
      </div>
    </section>
  </main>

  <script>
    // ---- Config ----
    var API_KEY = "%%JALENCLAW_API_KEY%%";
    if (API_KEY === "" || API_KEY === "%%JALENCLAW_API_KEY" + "%%") {
      API_KEY = new URLSearchParams(window.location.search).get("api_key") || "";
    }
    var CIRCUMFERENCE = 2 * Math.PI * 36;
    var lastUpdateTime = Date.now();
    var chatMessages = [];
    var chatGroupId = "webchat-" + Math.random().toString(36).slice(2, 10);
    var chatWaiting = false;
    var ws = null;
    var wsReconnectDelay = 1000;
    var wsMaxReconnectDelay = 30000;

    // ---- Breadcrumb map ----
    var breadcrumbs = {
      dashboard: { title: "Dashboard", sub: " \u2014 Real-time monitoring" },
      webchat: { title: "WebChat", sub: " \u2014 Chat with JalenClaw" },
      channels: { title: "Channels", sub: " \u2014 Channel management" },
      sessions: { title: "Sessions", sub: " \u2014 Active sessions" },
      settings: { title: "Settings", sub: " \u2014 Configuration" }
    };

    // ---- View switching ----
    function switchView(name) {
      var views = document.querySelectorAll(".view");
      for (var i = 0; i < views.length; i++) { views[i].classList.remove("active"); }
      var target = document.getElementById("view-" + name);
      if (target) target.classList.add("active");

      var navs = document.querySelectorAll(".nav-item");
      for (var i = 0; i < navs.length; i++) {
        navs[i].classList.toggle("active", navs[i].getAttribute("data-view") === name);
      }

      var bc = breadcrumbs[name] || { title: name, sub: "" };
      document.getElementById("breadcrumb-title").textContent = bc.title;
      document.getElementById("breadcrumb-sub").innerHTML = bc.sub;

      // Close mobile sidebar
      document.getElementById("sidebar").classList.remove("open");
      document.getElementById("sidebar-overlay").classList.remove("open");

      if (name === "webchat") scrollChatToBottom();
    }

    // ---- Helpers ----
    function formatNum(n) { return n == null ? "0" : Number(n).toLocaleString(); }
    function formatBytes(b) {
      if (b == null || b === 0) return "0 B";
      if (typeof b === "string") return b;
      var u = ["B","KB","MB","GB"], i = 0, v = b;
      while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
      return v.toFixed(i > 0 ? 1 : 0) + " " + u[i];
    }
    function formatUptime(s) {
      if (s == null) return "--";
      s = Math.floor(s);
      var d = Math.floor(s/86400), h = Math.floor((s%86400)/3600), m = Math.floor((s%3600)/60), sec = s%60;
      if (d > 0) return d+"d "+h+"h "+m+"m";
      if (h > 0) return h+"h "+m+"m "+sec+"s";
      if (m > 0) return m+"m "+sec+"s";
      return sec+"s";
    }
    function timeAgo(ts) {
      if (!ts) return "--";
      var d = Math.floor((Date.now() - new Date(ts).getTime())/1000);
      if (d < 0) d = 0;
      if (d < 5) return "just now";
      if (d < 60) return d+"s ago";
      if (d < 3600) return Math.floor(d/60)+"m ago";
      if (d < 86400) return Math.floor(d/3600)+"h ago";
      return Math.floor(d/86400)+"d ago";
    }
    function escHtml(s) {
      if (!s) return "";
      return s.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;");
    }
    function truncate(s, l) { s = String(s||""); return s.length > l ? s.substring(0,l)+"..." : s || "--"; }
    function providerClass(n) {
      n = (n||"").toLowerCase();
      if (n.includes("openai")||n.includes("gpt")) return "openai";
      if (n.includes("anthropic")||n.includes("claude")) return "anthropic";
      if (n.includes("google")||n.includes("gemini")) return "google";
      return "default";
    }

    // ---- API ----
    async function fetchJSON(endpoint) {
      var h = {};
      if (API_KEY) h["X-Api-Key"] = API_KEY;
      var r = await fetch(endpoint, { headers: h });
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    }

    // ---- Gauge ----
    function setGauge(id, pct) {
      pct = Math.max(0, Math.min(100, pct||0));
      var el = document.getElementById(id);
      if (el) el.style.strokeDashoffset = CIRCUMFERENCE - (pct/100)*CIRCUMFERENCE;
    }

    // ---- Render: System ----
    function renderSystem(data) {
      var cpuPct = data.cpuUsage || 0;
      setGauge("cpu-gauge", cpuPct);
      var cv = document.getElementById("cpu-value"); if (cv) cv.textContent = Math.round(cpuPct)+"%";

      var memMB = 0, memPct = 0;
      if (typeof data.memoryUsage === "number") memMB = data.memoryUsage;
      else if (typeof data.memoryUsage === "string") memMB = parseFloat(data.memoryUsage)||0;
      else if (data.memoryUsage && data.memoryUsage.heapUsed) memMB = data.memoryUsage.heapUsed/(1024*1024);
      var heapTotal = (data.memoryUsage && data.memoryUsage.heapTotal) || 512*1024*1024;
      if (typeof heapTotal === "number" && heapTotal > 1024) memPct = (memMB*1024*1024/heapTotal)*100;
      else memPct = (memMB/512)*100;
      memPct = Math.min(memPct, 100);
      setGauge("mem-gauge", memPct);
      var mv = document.getElementById("mem-value"); if (mv) mv.textContent = Math.round(memPct)+"%";

      setText("sys-uptime", formatUptime(data.uptime));
      setText("sys-memory", memMB >= 1 ? memMB.toFixed(1)+" MB" : formatBytes(memMB));
      setText("sys-node", data.nodeVersion || data.node || "--");
      setText("sys-channels", (data.channels||[]).length);
      setText("uptime-badge", "up "+formatUptime(data.uptime));
      setText("node-version", data.nodeVersion || data.node || "--");
      setText("pid-info", data.pid || "--");
      lastUpdateTime = Date.now();
    }
    function setText(id, val) { var e = document.getElementById(id); if (e) e.textContent = val; }

    // ---- Render: Channels ----
    function renderChannelList(containerId, countId, channels) {
      var container = document.getElementById(containerId);
      var countEl = document.getElementById(countId);
      if (countEl) countEl.textContent = channels.length;
      if (!container) return;
      if (channels.length === 0) {
        container.innerHTML = '<li class="empty-state"><div class="empty-state-icon">&#8644;</div>No channels connected</li>';
        return;
      }
      container.innerHTML = channels.map(function(ch) {
        var st = ch.status||"disconnected";
        return '<li class="channel-item"><div class="channel-left">' +
          '<span class="status-dot '+escHtml(st)+'"></span>' +
          '<span class="channel-name">'+escHtml(ch.name||ch.id||"unknown")+'</span>' +
          '<span class="status-badge '+escHtml(st)+'">'+escHtml(st)+'</span></div>' +
          '<div class="channel-right">' +
          '<span class="channel-msgs">'+formatNum(ch.messageCount||ch.messages||0)+' msgs</span>' +
          '<span class="channel-time">'+timeAgo(ch.lastActivity||ch.lastMessage)+'</span></div></li>';
      }).join("");
    }
    function renderChannels(data) {
      var ch = Array.isArray(data) ? data : (data.channels||[]);
      renderChannelList("dash-channel-list", "dash-channel-count", ch);
      renderChannelList("channels-view-list", "channels-view-count", ch);
    }

    // ---- Render: Sessions ----
    function renderSessionsView(containerId, countId, sessions) {
      var container = document.getElementById(containerId);
      var countEl = document.getElementById(countId);
      if (countEl) countEl.textContent = sessions.length;
      if (!container) return;
      if (sessions.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9783;</div>No active sessions</div>';
        return;
      }
      var html = '<table class="sessions-table"><thead><tr><th>Group ID</th><th>Messages</th><th>Last Active</th><th>Provider</th></tr></thead><tbody>';
      html += sessions.map(function(s) {
        var pc = providerClass(s.provider||"");
        return '<tr><td class="mono">'+escHtml(truncate(s.groupId||s.id||"--",20))+'</td>' +
          '<td class="mono">'+formatNum(s.messageCount||s.messages||0)+'</td>' +
          '<td>'+timeAgo(s.lastActive||s.lastActivity||s.updatedAt)+'</td>' +
          '<td><span class="provider-tag '+pc+'">'+escHtml(s.provider||"--")+'</span></td></tr>';
      }).join("");
      html += '</tbody></table>';
      container.innerHTML = html;
    }
    function renderSessions(data) {
      var s = Array.isArray(data) ? data : (data.sessions||[]);
      renderSessionsView("sessions-view-container", "sessions-view-count", s);
    }

    // ---- Render: LLM Usage ----
    function renderLLMUsage(data) {
      var usage = data.llmUsage||data.llm||data;
      if (!usage || typeof usage !== "object") return;
      var providers = Object.entries(usage);
      var container = document.getElementById("llm-bars");
      if (!container) return;
      if (providers.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">&#9733;</div>No LLM usage recorded</div>';
        setText("llm-total-tokens", "0 tokens");
        return;
      }
      var maxT = Math.max.apply(null, providers.map(function(p){return p[1].tokens||0;}));
      var totalT = providers.reduce(function(s,p){return s+(p[1].tokens||0);},0);
      setText("llm-total-tokens", formatNum(totalT)+" tokens");
      container.innerHTML = providers.map(function(e) {
        var nm=e[0],info=e[1],tk=info.tokens||0,rq=info.requests||0;
        var pct = maxT>0?Math.round((tk/maxT)*100):0, cls=providerClass(nm);
        return '<div class="llm-bar-row"><div class="llm-bar-header">' +
          '<span class="llm-bar-name">'+escHtml(nm)+'</span>' +
          '<span class="llm-bar-stats">'+formatNum(tk)+' tokens</span></div>' +
          '<div class="llm-bar-track"><div class="llm-bar-fill '+cls+'" style="width:'+pct+'%"></div></div>' +
          '<div class="llm-bar-detail"><span>'+formatNum(rq)+' requests</span>' +
          '<span>'+(rq>0?formatNum(Math.round(tk/rq))+' avg tokens/req':'')+'</span></div></div>';
      }).join("");
    }

    // ---- Render: Messages ----
    function renderMessages(messages) {
      var feed = document.getElementById("message-feed");
      var list = Array.isArray(messages)?messages:[];
      setText("msg-count-badge", list.length);
      if (!feed) return;
      if (list.length === 0) {
        feed.innerHTML = '<div class="empty-state" style="padding:40px 16px;"><div class="empty-state-icon">&#9993;</div>Waiting for messages...</div>';
        return;
      }
      feed.innerHTML = list.map(function(msg) {
        var dir = msg.direction||"inbound";
        var arrow = dir==="inbound"?"\u2192":"\u2190";
        var preview = truncate(msg.preview||msg.content||msg.text||"",100);
        return '<div class="msg-row"><span class="msg-time">'+timeAgo(msg.timestamp)+'</span>' +
          '<span class="msg-dir '+dir+'">'+arrow+'</span>' +
          '<span class="msg-channel-badge">'+escHtml(msg.channel||"--")+'</span>' +
          '<span class="msg-preview">'+escHtml(preview)+'</span></div>';
      }).join("");
      feed.scrollTop = feed.scrollHeight;
    }

    // ---- Render: Settings ----
    function renderSettings(data) {
      var gw = document.getElementById("settings-gateway");
      var pr = document.getElementById("settings-provider");
      var mem = document.getElementById("settings-memory");
      var sys = document.getElementById("settings-system");
      if (gw) gw.innerHTML = settingsRows({ "Status": "Running", "Uptime": formatUptime(data.uptime), "Channels": (data.channels||[]).length, "Sessions": (data.sessions||[]).length });
      if (pr) pr.innerHTML = settingsRows({ "Memory Used": (typeof data.memoryUsage === "number" ? data.memoryUsage+" MB" : "--"), "LLM Providers": Object.keys(data.llmUsage||{}).join(", ")||"none" });
      if (mem) mem.innerHTML = settingsRows({ "Backend": "sqlite", "Sessions": (data.sessions||[]).length });
      if (sys) sys.innerHTML = settingsRows({ "Node.js": data.nodeVersion||data.node||"--", "PID": data.pid||"--", "Platform": navigator.platform||"--" });
    }
    function settingsRows(obj) {
      return Object.entries(obj).map(function(e) {
        return '<div class="settings-row"><span class="settings-key">'+escHtml(e[0])+'</span><span class="settings-val">'+escHtml(String(e[1]))+'</span></div>';
      }).join("");
    }

    // ---- Last updated ticker ----
    function updateLastUpdated() {
      var d = Math.floor((Date.now()-lastUpdateTime)/1000);
      setText("last-updated", d < 3 ? "updated just now" : "updated "+d+"s ago");
    }

    // ---- Data fetching ----
    async function fetchStatus() {
      try {
        var data = await fetchJSON("/api/status");
        renderSystem(data);
        if (data.channels) renderChannels(data);
        if (data.llmUsage||data.llm) renderLLMUsage(data);
        if (data.sessions) renderSessions(data);
        renderSettings(data);
      } catch (e) { console.error("Status fetch failed:", e); }
    }
    async function fetchChannels() {
      try { var data = await fetchJSON("/api/channels"); renderChannels(data); } catch(e) {}
    }
    async function fetchSessions() {
      try { var data = await fetchJSON("/api/sessions"); renderSessions(data); } catch(e) {}
    }
    async function fetchMessages() {
      try {
        var data = await fetchJSON("/api/messages/recent");
        var list = Array.isArray(data)?data:(data.messages||[]);
        renderMessages(list);
      } catch(e) {}
    }

    // ---- WebChat ----
    function formatChatContent(text) {
      // Simple markdown-like: code blocks, inline code
      text = escHtml(text);
      // Code blocks: \`\`\`...\`\`\`
      text = text.replace(/\`\`\`([\s\S]*?)\`\`\`/g, function(m,c) {
        return '<pre><code>'+c.trim()+'</code></pre>';
      });
      // Inline code: \`...\`
      text = text.replace(/\`([^\`]+)\`/g, '<code>\$1</code>');
      // Bold: **...**
      text = text.replace(/\*\*([^*]+)\*\*/g, '<strong>\$1</strong>');
      // Newlines
      text = text.replace(/\n/g, '<br>');
      return text;
    }

    function renderChat() {
      var container = document.getElementById("chat-messages");
      if (!container) return;
      if (chatMessages.length === 0) {
        container.innerHTML = '<div class="chat-empty"><div class="chat-empty-icon">&#9993;</div><span>Send a message to start chatting</span></div>';
        return;
      }
      container.innerHTML = chatMessages.map(function(m) {
        return '<div class="chat-bubble '+escHtml(m.role)+'">'+formatChatContent(m.content)+'</div>';
      }).join("");
      scrollChatToBottom();
    }

    function scrollChatToBottom() {
      var c = document.getElementById("chat-messages");
      if (c) setTimeout(function(){ c.scrollTop = c.scrollHeight; }, 50);
    }

    function sendChatMessage() {
      var input = document.getElementById("chat-input");
      var text = (input.value||"").trim();
      if (!text || chatWaiting) return;
      if (!ws || ws.readyState !== 1) { alert("WebSocket not connected"); return; }

      chatMessages.push({ role: "user", content: text });
      renderChat();
      input.value = "";
      autoResizeInput();

      chatWaiting = true;
      document.getElementById("chat-send").disabled = true;
      document.getElementById("chat-typing").classList.add("visible");

      ws.send(JSON.stringify({ type: "message", content: text, groupId: chatGroupId }));
    }

    function handleChatResponse(content) {
      chatWaiting = false;
      document.getElementById("chat-send").disabled = false;
      document.getElementById("chat-typing").classList.remove("visible");
      chatMessages.push({ role: "assistant", content: content });
      renderChat();
    }

    function autoResizeInput() {
      var el = document.getElementById("chat-input");
      el.style.height = "auto";
      el.style.height = Math.min(el.scrollHeight, 120) + "px";
    }

    // ---- WebSocket ----
    function connectWS() {
      var proto = location.protocol === "https:" ? "wss:" : "ws:";
      var wsUrl = proto + "//" + location.host + "?api_key=" + encodeURIComponent(API_KEY);
      var dot = document.getElementById("ws-dot");
      var label = document.getElementById("ws-label");
      var badge = document.getElementById("conn-status");

      try { ws = new WebSocket(wsUrl); } catch(e) {
        dot.className = "conn-dot dead"; label.textContent = "error"; badge.className = "conn-status";
        scheduleReconnect(); return;
      }

      ws.onopen = function() {
        dot.className = "conn-dot live"; label.textContent = "live"; badge.className = "conn-status live";
        wsReconnectDelay = 1000;
      };

      ws.onclose = function() {
        dot.className = "conn-dot dead"; label.textContent = "disconnected"; badge.className = "conn-status";
        scheduleReconnect();
      };

      ws.onerror = function() {
        dot.className = "conn-dot dead"; label.textContent = "error"; badge.className = "conn-status";
      };

      ws.onmessage = function(event) {
        try {
          var msg = JSON.parse(event.data);

          // Handle chat responses
          if (msg.type === "response" && msg.groupId === chatGroupId) {
            handleChatResponse(msg.content || "");
            return;
          }

          // Handle dashboard message feed
          if (msg.type === "message") {
            var feed = document.getElementById("message-feed");
            if (!feed) return;
            var empty = feed.querySelector(".empty-state");
            if (empty) feed.innerHTML = "";
            var dir = msg.direction||"inbound";
            var arrow = dir==="inbound"?"\u2192":"\u2190";
            var preview = truncate(msg.preview||msg.content||msg.text||"",100);
            var row = document.createElement("div");
            row.className = "msg-row new";
            row.innerHTML = '<span class="msg-time">'+timeAgo(msg.timestamp||Date.now())+'</span>' +
              '<span class="msg-dir '+dir+'">'+arrow+'</span>' +
              '<span class="msg-channel-badge">'+escHtml(msg.channel||"--")+'</span>' +
              '<span class="msg-preview">'+escHtml(preview)+'</span>';
            feed.appendChild(row);
            while (feed.children.length > 50) feed.removeChild(feed.firstChild);
            feed.scrollTop = feed.scrollHeight;
            setText("msg-count-badge", feed.children.length);
          }
        } catch(e) {}
      };
    }

    function scheduleReconnect() {
      setTimeout(function() {
        connectWS();
        wsReconnectDelay = Math.min(wsReconnectDelay * 2, wsMaxReconnectDelay);
      }, wsReconnectDelay);
    }

    // ---- Sidebar toggle ----
    function toggleSidebar() {
      document.getElementById("sidebar").classList.toggle("open");
      document.getElementById("sidebar-overlay").classList.toggle("open");
    }

    // ---- Chat input handlers ----
    document.addEventListener("DOMContentLoaded", function() {
      var input = document.getElementById("chat-input");
      var sendBtn = document.getElementById("chat-send");
      if (input) {
        input.addEventListener("keydown", function(e) {
          if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendChatMessage(); }
        });
        input.addEventListener("input", autoResizeInput);
      }
      if (sendBtn) sendBtn.addEventListener("click", sendChatMessage);

      var sessionSelect = document.getElementById("chat-session-select");
      if (sessionSelect) {
        sessionSelect.addEventListener("change", function() {
          if (this.value) {
            chatGroupId = this.value;
          } else {
            chatGroupId = "webchat-" + Math.random().toString(36).slice(2, 10);
          }
          chatMessages = [];
          chatWaiting = false;
          document.getElementById("chat-send").disabled = false;
          document.getElementById("chat-typing").classList.remove("visible");
          renderChat();
        });
      }
    });

    // ---- Initialize ----
    (function init() {
      fetchStatus();
      fetchMessages();
      setInterval(fetchStatus, 3000);
      setInterval(fetchChannels, 5000);
      setInterval(fetchSessions, 5000);
      setInterval(fetchMessages, 3000);
      setInterval(updateLastUpdated, 1000);
      connectWS();
    })();
  </script>
</body>
</html>
`;
