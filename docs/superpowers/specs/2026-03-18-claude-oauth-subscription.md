# Claude Code 订阅 OAuth 认证设计文档

> 为 JalenClaw 的 Claude LLM Provider 增加 OAuth 认证方式，支持用户通过 Claude Pro/Team/Enterprise 订阅额度调用 Claude，而非仅支持 API Key。

## 1. 背景与动机

当前设计文档中 Claude provider 仅支持 API Key 认证（`${ANTHROPIC_API_KEY}`）。许多用户已有 Claude 订阅（Pro/Team/Enterprise），希望直接复用订阅额度，无需额外购买 API 额度。

**已知政策风险**：Anthropic 于 2026 年 2 月明确禁止第三方应用使用订阅 OAuth token。本设计为技术实现，用户需自行评估政策风险。

### OpenClaw 的实现与教训

OpenClaw 通过 `setup-token` 方式（从 Claude Code CLI 导出长期 token）支持订阅认证，存在以下问题：

- **Token 刷新竞态**：Claude Code CLI 刷新 token 后，OpenClaw 存储的旧 refresh token 失效
- **Stale token 覆写**：Gateway 周期性用过期 token 覆盖配置文件
- **无重试逻辑**：`getOAuthApiKey()` 对瞬时失败无重试
- **配置不一致**：向导设置的 `mode` 与实际存储格式不匹配

JalenClaw 的方案规避这些问题：不读取 Claude Code CLI 的 token，自建完整 OAuth 流程，核心进程统一管理 token 刷新。

## 2. 认证方式与配置

Claude provider 支持两种互斥的认证方式，通过 `authType` 字段选择：

```yaml
models:
  providers:
    claude:
      authType: "oauth"          # "oauth" | "apikey"
      # apikey 模式:
      # apiKey: "${ANTHROPIC_API_KEY}"
      # oauth 模式（可选覆盖内置 client ID）:
      # oauthClientId: "..."
```

- `authType: "apikey"` — 现有方案，通过环境变量引用 API Key
- `authType: "oauth"` — 通过 OAuth 流程获取用户订阅 token
- `authType` 为必填字段（Zod `discriminatedUnion` 需要显式声明）

Zod schema 使用 discriminated union 校验：`authType: "oauth"` 时不需要 `apiKey`，`authType: "apikey"` 时必须有 `apiKey`。

### 配置迁移

已有的 `jalenclaw.yml` 中若无 `authType` 字段，`jalenclaw config migrate` 自动补全为 `authType: "apikey"`（Zod `discriminatedUnion` 要求该字段必须显式存在）。从 `oauth` 切换回 `apikey` 时，不自动清除存储的 token（用户可通过 `jalenclaw auth logout` 手动清除）。

## 3. OAuth 流程

### 3.1 登录触发

两种触发方式：

1. **CLI 命令**：`jalenclaw auth login` — 手动登录/重新登录
2. **自动检测**：启动时检测到 `authType: "oauth"` 但无有效 token，自动引导登录

### 3.2 OAuth 端点

- **授权端点**：`https://claude.ai/oauth/authorize`
- **Token 端点**：`https://claude.ai/oauth/token`
- **所需 Scopes**：`user:inference`、`user:profile`
- **Client ID**：使用 Claude Code 的公开 client ID（硬编码），可通过配置 `oauthClientId` 覆盖
- **Client 类型**：公开客户端（无 client_secret），依赖 PKCE

### 3.3 授权流程（Authorization Code + PKCE）

**本地场景：**

1. 生成 PKCE code_verifier + code_challenge（SHA-256）
2. 启动临时 HTTP server 监听 `127.0.0.1:<随机端口>/callback`
3. 自动打开浏览器跳转授权端点（携带 client_id、redirect_uri、code_challenge、scope）
4. 用户登录授权 → 回调携带 authorization code
5. 用 code + code_verifier 请求 token 端点换取 access_token + refresh_token
6. 关闭临时 server，存储 token

**远程场景（无浏览器）：**

远程场景下 `--manual` 为默认行为：

1. 检测到无 GUI 环境（无 `$DISPLAY` 且有 `$SSH_TTY`）
2. 在终端打印授权 URL，提示用户在本地浏览器打开
3. 用户完成授权后，浏览器跳转到 `http://127.0.0.1:<port>/callback?code=...`（会失败）
4. 提示用户复制浏览器地址栏完整 URL，粘贴到终端
5. 解析 URL 中的 authorization code，换取 token
6. 也可通过 SSH 端口转发使回调直达（`ssh -L <port>:127.0.0.1:<port>`），此时与本地场景一致

回调超时：10 分钟（远程手动流程需要更多时间）。

### 3.4 CLI 子命令

```bash
jalenclaw auth login     # 启动 OAuth 登录流程
jalenclaw auth login --manual  # 强制手动模式（粘贴 URL）
jalenclaw auth logout    # 清除存储的 token
jalenclaw auth status    # 显示当前认证状态（token 是否有效、过期时间）
jalenclaw auth refresh   # 手动刷新 token（调试用）
```

## 4. Token 存储与刷新

### 4.1 存储

Token 存储在 `~/.jalenclaw/auth/oauth-credentials.json`，文件权限 `0600`：

```json
{
  "version": 1,
  "accessToken": "sk-ant-oat01-...",
  "refreshToken": "sk-ant-ort01-...",
  "expiresAt": 1748658860401,
  "scopes": ["user:inference", "user:profile"]
}
```

- 不使用系统 keychain，不使用加密——依赖文件系统权限保护，与 Claude Code CLI 自身策略一致
- `version` 字段用于未来格式迁移

### 4.2 刷新策略

1. **主动刷新**：每次 LLM 调用前检查 `expiresAt`，提前 5 分钟刷新
2. **被动刷新**：收到 401 响应时立即尝试刷新
3. **刷新失败通知**：refresh token 也失效时，通过日志 warn + 可配置 webhook 通知用户重新登录；若有活跃消息通道，同时通过通道通知
4. **熔断机制**：连续 3 次刷新失败后进入熔断状态（停止自动刷新 15 分钟），避免对 Anthropic 端点的无效请求风暴。熔断期间所有 LLM 调用返回"认证失效，请运行 `jalenclaw auth login`"错误。熔断重置条件：15 分钟自然过期、用户执行 `jalenclaw auth login` 成功、或 `jalenclaw auth refresh` 成功

### 4.3 Token 文件并发访问

运行时只有核心进程读写 token 文件（Agent 子进程通过 IPC 获取 headers），因此不需要文件锁。

当用户在核心进程运行中执行 `jalenclaw auth login` 时：
1. CLI 命令完成 OAuth 流程，写入新 token 文件
2. CLI 命令通过 IPC 发送 `{"type":"auth_reload"}` 通知核心进程
3. 核心进程收到信号后重新加载 token 文件

## 5. 架构集成

### 5.1 LLMProvider 接口

现有 `LLMProvider` 接口不变。变化集中在 Claude provider 内部：

```typescript
// src/models/claude.ts
class ClaudeProvider implements LLMProvider {
  private authStrategy: AuthStrategy;

  async chat(messages, tools) {
    const headers = await this.authStrategy.getHeaders();
    // OAuth: { "Authorization": "Bearer sk-ant-oat01-..." }
    // APIKey: { "X-Api-Key": "sk-ant-api03-..." }
  }
}
```

### 5.2 新增模块

```
src/auth/
├── strategy.ts        # AuthStrategy 接口
├── apikey.ts          # API Key 策略（已有逻辑提取）
├── oauth.ts           # OAuth 策略（核心新增）
├── token-store.ts     # Token 文件读写
└── oauth-server.ts    # 临时 HTTP server 处理回调 + 手动模式
```

`src/auth/` 作为独立模块——这是 LLM 调用的认证，与 `src/gateway/auth.ts`（Gateway 用户认证）职责不同。

### 5.3 启动流程变更

```
jalenclaw start
  → 加载配置
  → 检测 claude.authType
  → if "oauth":
      → 读取 ~/.jalenclaw/auth/oauth-credentials.json
      → token 有效 → 正常启动
      → token 过期 → 尝试刷新 → 成功则启动
      → 无 token 或刷新失败 → 引导 OAuth 登录流程
  → if "apikey":
      → 现有逻辑不变
```

### 5.4 并发安全

核心进程单点持有 token，Agent 子进程通过 IPC 向核心进程请求已认证的 headers，不直接读取 token 文件。刷新操作由核心进程统一执行，避免多进程竞态。

IPC 消息类型扩展（补充主设计文档 §9）：

```json
{"type":"auth_headers_request","id":"uuid"}\n
{"type":"auth_headers_response","id":"uuid","payload":{"Authorization":"Bearer sk-ant-oat01-..."}}\n
{"type":"auth_reload","id":"uuid"}\n
{"type":"ack","id":"uuid"}\n
```

当 `jalenclaw auth login` 运行时若无核心进程，CLI 直接写入 token 文件并退出——核心进程下次启动时自动加载。

## 6. 错误处理

| 错误场景 | 处理方式 |
|---|---|
| 401 Unauthorized | 尝试刷新 token，刷新失败则通知用户重新登录 |
| 403 "only authorized for use with Claude Code" | 日志 error 记录，持续通知用户（不仅一次），停止对该 token 的后续重试 |
| 429 Rate Limit | 沿用现有重试策略（指数退避，最多 3 次） |
| refresh token 失效 | 清除本地 token，通知用户通过 `jalenclaw auth login` 重新登录 |
| OAuth 回调超时 | 10 分钟未完成授权则关闭临时 server，提示超时 |

## 7. 配置 schema 变更

```typescript
// src/config/schema.ts
const claudeBaseConfig = z.object({
  model: z.string().optional(),          // 模型名称覆盖
  timeout: z.number().optional(),        // 单次调用超时（秒）
  baseUrl: z.string().url().optional(),  // 端点覆盖
});

const claudeApiKeyAuth = claudeBaseConfig.extend({
  authType: z.literal("apikey"),
  apiKey: z.string().min(1),
});

const claudeOAuthAuth = claudeBaseConfig.extend({
  authType: z.literal("oauth"),
  oauthClientId: z.string().optional(),
});

const claudeProviderConfig = z.discriminatedUnion("authType", [
  claudeApiKeyAuth,
  claudeOAuthAuth,
]);
```

## 8. 安全考量

- OAuth token 文件权限 `0600`，仅当前用户可读写
- 安全审计日志记录所有 OAuth 操作（登录、刷新、失败）
- PKCE 防止授权码拦截攻击
- 临时 HTTP server 仅绑定 `127.0.0.1`，不暴露外部
- 不存储 client_secret（公开客户端，依赖 PKCE）

## 9. 目录结构变更

```diff
 jalenclaw/
  src/
+   auth/
+   ├── strategy.ts
+   ├── apikey.ts
+   ├── oauth.ts
+   ├── token-store.ts
+   └── oauth-server.ts
    models/
      claude.ts              # 修改：集成 AuthStrategy
    config/
      schema.ts              # 修改：增加 discriminated union
```
