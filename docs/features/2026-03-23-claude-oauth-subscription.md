# Feature: Claude OAuth 订阅认证

## 目标
让 JalenClaw 能通过 Claude Pro/Max 订阅（OAuth token）调用 Claude API，而不仅支持 API Key。

## 当前状态
🟡 进行中 — OAuth 登录流程已完成，Haiku 4.5 可用，Sonnet 4.6 被限制

---

## 关键发现

### Pi-AI SDK 逆向分析（源码：`@mariozechner/pi-ai@0.61.1`）

通过分析 OpenClaw 使用的 `dist/utils/oauth/anthropic.js`，发现完整的 OAuth 实现细节。

#### OAuth 端点

| 用途 | URL |
|---|---|
| 授权 | `https://claude.ai/oauth/authorize` |
| Token 交换/刷新 | `https://platform.claude.com/v1/oauth/token` |
| 回调 | `http://localhost:53692/callback`（固定端口） |

#### Client ID
```
9d1c250a-e61b-44d9-88ed-5944d1962f5e
```
（Pi-AI SDK 中 base64 编码存储：`atob("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl")`）

#### Scopes
```
org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload
```

#### Token 交换：JSON body（不是 URL-encoded）
```javascript
fetch(TOKEN_URL, {
  method: "POST",
  headers: { "Content-Type": "application/json", "Accept": "application/json" },
  body: JSON.stringify({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code, state, redirect_uri, code_verifier
  }),
});
```

#### API 调用 Headers（关键！）

Pi-AI SDK 对 OAuth token 使用的 headers（`dist/providers/anthropic.js` 第 439-453 行）：

```javascript
// OAuth token 检测
function isOAuthToken(apiKey) {
  return apiKey.includes("sk-ant-oat");
}

// OAuth 模式：用 authToken（Bearer），不是 apiKey（x-api-key）
if (isOAuthToken(apiKey)) {
  const client = new Anthropic({
    apiKey: null,
    authToken: apiKey,             // 发送为 Authorization: Bearer
    baseURL: model.baseUrl,
    dangerouslyAllowBrowser: true,
    defaultHeaders: {
      "accept": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
      "anthropic-beta": "claude-code-20250219,oauth-2025-04-20,fine-grained-tool-streaming-2025-05-14",
      "user-agent": "claude-cli/<version>",
      "x-app": "cli",
    },
  });
}
```

#### Sonnet 4.6 需要 adaptive thinking

```javascript
// Sonnet 4.6 / Opus 4.6 使用 adaptive thinking（不是 budget-based）
if (supportsAdaptiveThinking(model.id)) {
  params.thinking = { type: "adaptive" };
  params.output_config = { effort: "high" };
}
```

---

## 已尝试的方案

| # | 方案 | 结果 | 原因 |
|---|---|---|---|
| 1 | 自建 OAuth + `console.anthropic.com/oauth/token` | ❌ 404 HTML 页面 | Token 端点错误，应为 `platform.claude.com` |
| 2 | Token 端点 `api.anthropic.com/oauth/token` | ❌ 404 | 端点不存在 |
| 3 | Token 端点 `platform.claude.com/v1/oauth/token` + URL-encoded body | ❌ 失败 | 需要 JSON body |
| 4 | Token 端点 `platform.claude.com/v1/oauth/token` + JSON body | ✅ Token 获取成功 | — |
| 5 | 自己获取的 OAuth token 作为 `x-api-key` 调 API | ❌ `invalid x-api-key` | 自建 OAuth session 的 token 不被接受 |
| 6 | Claude Code 的 token 作为 `x-api-key` 调 API | ❌ `invalid_request_error: Error`（对 Sonnet 4.6）| 模型级限制 |
| 7 | Claude Code 的 token 作为 `x-api-key` 调 Haiku 4.5 | ✅ 成功 | — |
| 8 | Claude Code 的 token 作为 `Authorization: Bearer` + beta headers 调 Haiku 4.5 | ✅ 成功 | 这是 Pi-AI SDK 的正确做法 |
| 9 | Claude Code 的 token 作为 Bearer + beta headers 调 Sonnet 4.6 | ❌ `invalid_request_error: Error` | 可能是配额/速率限制 |
| 10 | 加上 `thinking: { type: "adaptive" }` | ❌ 同样 `invalid_request_error: Error` | 不是 thinking 的问题 |
| 11 | 自己获取的 token 作为 Bearer + 全部 beta headers | ❌ 同 #9 | 两个 token 表现一致 |

### 关键结论

- **OAuth 登录流程**：已完全实现，能获取 token ✅
- **Haiku 4.5**：通过 `x-api-key` 或 `Bearer` + beta headers 都可用 ✅
- **Sonnet 4.6 / Opus 4.6**：返回 `invalid_request_error: Error`（无详细信息）
  - 不是 token 问题（Claude Code 自己的 token 也一样）
  - 不是认证问题（返回 400 不是 401）
  - 不是模型名问题（返回 400 不是 404）
  - 可能是**订阅配额已用尽**（Max 用户有每日用量限制，当前 session 正在消耗）
  - 或者 Anthropic 对非 Claude Code/claude.ai 来源做了额外限制

---

## 当前方案

### 已实现（可用）
1. OAuth 登录：`jalenclaw auth login` — 打开浏览器，固定端口 53692 回调，JSON body token 交换
2. Claude Code 导入：`jalenclaw auth login --import` — 从 Keychain/文件导入
3. Token 刷新：`jalenclaw auth refresh` — 自动刷新或重新导入
4. API 调用：默认 Haiku 4.5（`x-api-key` 模式）

### 待解决（Sonnet 4.6）
- 需要确认 `invalid_request_error: Error` 是配额问题还是权限问题
- 尝试在配额刷新后重试
- 考虑用 `Bearer` + Pi-AI beta headers 作为 Claude provider 的 OAuth 模式
- 需要实现 Pi-AI SDK 完全一致的请求头和参数

---

## 相关文件

| 文件 | 作用 |
|---|---|
| `src/cli/auth.ts` | OAuth 登录/导入/状态/刷新 CLI 命令 |
| `src/cli/setup.ts` | 首次运行 setup wizard |
| `src/cli/start.ts` | 应用启动，OAuth token → ApiKeyStrategy |
| `src/models/claude.ts` | Claude provider，使用 Anthropic SDK |
| `src/auth/oauth.ts` | OAuthStrategy（token 刷新 + 熔断） |
| `src/auth/oauth-server.ts` | 本地回调服务器（支持固定端口） |
| `src/auth/token-store.ts` | Token 文件读写 |
| `src/auth/bearer.ts` | BearerTokenStrategy（目前未使用） |
| `openclaw-ref/` | OpenClaw 源码参考 |
| `/tmp/pi-ai-inspect/` | Pi-AI SDK 解包分析 |

## 参考

- Spec V1: `docs/superpowers/specs/2026-03-18-claude-oauth-subscription.md`
- Spec V2: `docs/superpowers/specs/2026-03-23-claude-oauth-subscription-v2.md`
- Pi-AI SDK OAuth: `/tmp/pi-ai-inspect/package/dist/utils/oauth/anthropic.js`
- Pi-AI SDK Anthropic Provider: `/tmp/pi-ai-inspect/package/dist/providers/anthropic.js`
