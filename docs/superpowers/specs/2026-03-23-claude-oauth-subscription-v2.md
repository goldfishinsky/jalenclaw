# Claude OAuth 订阅认证 V2 — 基于 Pi-AI SDK 逆向分析

> 基于 OpenClaw 使用的 `@mariozechner/pi-ai` 内部 SDK 逆向分析，实现完整的 Claude Code 订阅 OAuth 认证。

## 1. 核心发现

通过分析 `@mariozechner/pi-ai@0.61.1` 的 `dist/utils/oauth/anthropic.js`，发现以下关键信息：

### 1.1 正确的 OAuth 端点

| 用途 | URL | 说明 |
|---|---|---|
| 授权端点 | `https://claude.ai/oauth/authorize` | 用户登录授权页面 |
| Token 端点 | `https://platform.claude.com/v1/oauth/token` | **关键！不是 api.anthropic.com** |
| 回调地址 | `http://localhost:53692/callback` | 固定端口 53692 |

### 1.2 正确的 Client ID

```javascript
const CLIENT_ID = atob("OWQxYzI1MGEtZTYxYi00NGQ5LTg4ZWQtNTk0NGQxOTYyZjVl");
// = "9d1c250a-e61b-44d9-88ed-5944d1962f5e"
```

### 1.3 正确的 Scopes

```
org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload
```

注意：比我们之前用的多了 `user:sessions:claude_code`、`user:mcp_servers`、`user:file_upload`。

### 1.4 Token 交换方式

**用 JSON body，不是 URL-encoded form：**

```javascript
// 正确（OpenClaw/pi-ai 的做法）
await fetch(TOKEN_URL, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  body: JSON.stringify({
    grant_type: "authorization_code",
    client_id: CLIENT_ID,
    code,
    state,
    redirect_uri: redirectUri,
    code_verifier: verifier,
  }),
});

// 错误（我们之前的做法）
body: new URLSearchParams({ grant_type: "authorization_code", ... }).toString()
```

### 1.5 Token 使用方式

**最关键的发现：OAuth access token 直接作为 `x-api-key` 使用！**

```javascript
// pi-ai SDK 的 anthropicOAuthProvider
getApiKey(credentials) {
  return credentials.access;  // 直接返回 access token
}
```

OpenClaw 把 OAuth token（`sk-ant-oat01-...`）直接放在 `x-api-key` header 里发给 `api.anthropic.com/v1/messages`，**不是** 用 `Authorization: Bearer` header。

这就是为什么我们之前用 Bearer token 失败（"OAuth authentication is currently not supported"），而 OpenClaw 能用——因为它把 token 当 API key 发。

### 1.6 Token 刷新

```javascript
await fetch("https://platform.claude.com/v1/oauth/token", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "Accept": "application/json",
  },
  body: JSON.stringify({
    grant_type: "refresh_token",
    client_id: CLIENT_ID,
    refresh_token: refreshToken,
  }),
});
```

### 1.7 OAuth 授权 URL 参数

```
https://claude.ai/oauth/authorize?
  code=true&
  client_id=9d1c250a-e61b-44d9-88ed-5944d1962f5e&
  response_type=code&
  redirect_uri=http://localhost:53692/callback&
  scope=org:create_api_key user:profile user:inference user:sessions:claude_code user:mcp_servers user:file_upload&
  code_challenge=<sha256>&
  code_challenge_method=S256&
  state=<code_verifier>
```

注意：`state` 参数就是 `code_verifier`（Pi-AI SDK 的做法）。

## 2. 为什么之前失败

| 问题 | 我们的做法 | 正确的做法 |
|---|---|---|
| Token 端点 | `console.anthropic.com/oauth/token` → 404 HTML | `platform.claude.com/v1/oauth/token` |
| Token 端点 | `api.anthropic.com/oauth/token` → 404 | `platform.claude.com/v1/oauth/token` |
| Token 交换 Body | URL-encoded form | JSON body |
| Token 使用 | `Authorization: Bearer <token>` → 401 | `x-api-key: <token>` ← 直接当 API key |
| 回调地址 | 随机端口 | 固定端口 53692 |
| Redirect URI | `console.anthropic.com/oauth/code/callback` | `http://localhost:53692/callback` |
| Scopes | 3 个 | 6 个（包括 `user:sessions:claude_code`） |

## 3. 实现计划

### 3.1 修改 OAuth 登录流程 (`src/cli/auth.ts`)

1. 启动本地回调服务器在固定端口 `53692`
2. 构建授权 URL 使用正确的参数
3. 用 `state = code_verifier`（和 Pi-AI SDK 一致）
4. Token 交换使用 JSON body POST 到 `platform.claude.com/v1/oauth/token`
5. 存储 access_token、refresh_token、expires

### 3.2 修改 Claude Provider (`src/models/claude.ts`)

OAuth token 作为 `x-api-key` 发送（使用 `ApiKeyStrategy`），不是 Bearer token：

```typescript
// OAuth token 直接当 API key 用
authStrategy = new ApiKeyStrategy(tokens.accessToken);
```

### 3.3 修改 Token 刷新 (`src/auth/oauth.ts`)

刷新请求发到 `platform.claude.com/v1/oauth/token`，使用 JSON body。

### 3.4 兼容已有的 Claude Code 凭证导入

保留从 `~/.claude/.credentials.json` / macOS Keychain 导入的功能，导入后的 token 同样作为 `x-api-key` 使用。

## 4. 文件变更清单

| 文件 | 变更 |
|---|---|
| `src/cli/auth.ts` | 重写 OAuth 登录，使用正确端点和参数 |
| `src/cli/start.ts` | OAuth token 用 ApiKeyStrategy 而非 BearerTokenStrategy |
| `src/auth/oauth.ts` | 更新 token 刷新端点和请求格式 |
| `src/auth/oauth-server.ts` | 支持固定端口 53692 |
| `src/cli/setup.ts` | 更新 OAuth 登录流程 |
| `tests/` | 更新所有相关测试 |

## 5. 测试验证

1. `jalenclaw auth login` → 打开浏览器 → 回调接收 code → 交换 token → 存储
2. 用存储的 token 作为 `x-api-key` 调用 Claude API → 应该成功
3. Token 过期后自动刷新
4. Telegram bot 收到消息 → 用 Claude 回复
