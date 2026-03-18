# JalenClaw 设计文档

> 一个类 OpenClaw 的多通道 AI 助手平台，从架构层面解决 OpenClaw 社区反映的 20 大问题。

## 1. 项目概述

### 目标

复刻 OpenClaw 的核心功能，同时从架构层面优化安全性、内存占用、稳定性和可运维性。

### 技术栈

- **语言**：Node.js / TypeScript
- **架构**：分层混合架构（核心单进程 + Channel/Agent 子进程）
- **存储**：SQLite（本地）/ PostgreSQL（服务器），自动切换
- **LLM**：多模型支持（Claude、OpenAI、DeepSeek、Ollama）
- **部署**：本地（macOS/Linux）+ 服务器（VPS/云）

### 与 OpenClaw 的核心差异

| 维度 | OpenClaw | JalenClaw |
|---|---|---|
| 架构 | 单进程单体 ~390MB | 核心进程 <30MB + 按需子进程 |
| 安全 | 应用层权限检查 | 容器级隔离 + 强制认证 |
| 启动速度 | 30s+ | <3s（懒加载） |
| Channel 故障 | 拖垮全局 | 独立子进程，崩溃自动重启 |
| 记忆系统 | 单文件存储，崩溃易损坏 | SQLite WAL / PG 事务写入 |
| 可观测性 | 无结构化日志，无监控 | JSON 日志 + Prometheus 指标 |

### OpenClaw 20 大问题覆盖清单

| # | OpenClaw 问题 | 解法所在章节 |
|---|---|---|
| 1 | 配置文件按工作目录查找，启动失败 | §8 配置管理 |
| 2 | Gateway 端口被占用无法启动 | §8 CLI `doctor` 命令 |
| 3 | 反向代理端口冲突 | §8 配置管理 |
| 4 | 插件目录相对路径失效 | §8 配置管理（绝对路径） |
| 5 | 默认无认证暴露 135,000+ 实例 | §7 强制首次设置凭证 |
| 6 | 示例密钥被复制到生产 | §7/§8 不提供示例值 + 校验 |
| 7 | exec 权限过大 | §5 Agent 沙箱权限模型 |
| 8 | 无 TLS | §3 Gateway 内置 TLS |
| 9 | memoryFlush 导致重启丢失记忆 | §6 默认持久化 |
| 10 | 上下文溢出（全量加载） | §6 检索式加载 + token 预算 |
| 11 | 记忆无限增长 | §6 maxEntries + 相关性淘汰 |
| 12 | 崩溃后记忆损坏 | §6 SQLite WAL / PG 事务 |
| 13 | 30s+ 冷启动 | §2/§5 懒加载 Channel + LLM SDK |
| 14 | 高 token 消耗（3-5x） | §6 记忆压缩 + 检索式加载 |
| 15 | 工具执行阻塞全局 | §5 容器子进程隔离 + 超时 |
| 16 | 记忆搜索返回无关结果 | §6 语义检索替代关键词匹配 |
| 17 | 无结构化日志 | §9 JSON 日志 + pino |
| 18 | 无监控告警 | §9 Prometheus + webhook |
| 19 | 升级破坏配置格式 | §8 配置版本号 + migrate 命令 |
| 20 | 无回滚策略 | §8 backup create/restore |

### 平台支持范围

仅支持 macOS 和 Linux。Windows 不在范围内——容器隔离（Docker/Apple Container）、Unix Socket IPC、launchd/systemd 服务管理均为 Unix 原生特性，兼容 Windows 会显著增加复杂度且偏离目标用户群。

## 2. 整体架构

```
┌─────────────────────────────────────────────────┐
│                   CLI 入口进程                    │
│  ┌───────────┐  ┌──────────┐  ┌───────────────┐ │
│  │  Gateway   │  │  Router  │  │ Process Mgr   │ │
│  │ (HTTP/WS)  │  │ (消息路由) │  │ (子进程生命周期)│ │
│  └─────┬─────┘  └────┬─────┘  └───────┬───────┘ │
└────────┼─────────────┼────────────────┼─────────┘
         │             │                │
    ┌────┴────┐   ┌────┴────┐    ┌─────┴──────┐
    │ Channel  │   │ Channel │    │   Agent    │
    │ 子进程    │   │ 子进程   │    │  容器/子进程 │
    │(WhatsApp)│   │(Telegram)│   │ (隔离沙箱)  │
    └─────────┘   └─────────┘    └─────┬──────┘
                                       │
                                 ┌─────┴──────┐
                                 │ Memory Svc  │
                                 │ SQLite/PG   │
                                 └────────────┘
```

### 设计原则

- **按需加载**：未启用的 Channel 和空闲 Agent 不占内存
- **故障隔离**：Channel/Agent 崩溃不影响核心进程和其他组件
- **安全优先**：默认最严格配置，显式放宽而非显式收紧
- **简单部署**：一个 CLI 命令管理所有进程

## 3. 核心进程

核心进程包含三个模块，运行在同一个 Node.js 进程中：

### 3.1 Gateway

- HTTP API（管理接口、WebChat）+ WebSocket（实时消息推送）
- 默认绑定 `127.0.0.1`，显式配置才开放外部访问
- 强制首次启动设置 API Key，无凭证不启动
- WebSocket 严格校验 Origin header（修复 OpenClaw CVE-2026-25253）
- 所有来源统一 Rate Limit（含 localhost）
- 内置 `--tls` 选项自动生成自签证书

### 3.2 Router

- 入站：Channel 子进程 → Unix Socket IPC → Router → Agent
- 出站：Agent 响应 → Router → 目标 Channel 子进程
- 消息队列：内存队列 + 溢出写磁盘，防止消息丢失
- 消息格式标准化，统一所有 Channel 的消息结构

### 3.3 Process Manager

- 按需启动/销毁 Channel 子进程和 Agent 容器
- 健康检查 + 崩溃自动重启（指数退避策略）
- 优雅关闭：SIGTERM → 等待处理中消息完成 → SIGKILL
- 上报各子进程内存占用和状态

## 4. Channel 适配器系统

### 统一接口

```typescript
interface ChannelAdapter {
  name: string;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendMessage(target: string, message: OutboundMessage): Promise<void>;
  onMessage(handler: (msg: InboundMessage) => void): void;
}

interface InboundMessage {
  channelType: string;       // "whatsapp" | "telegram" | ...
  channelMessageId: string;
  senderId: string;
  groupId?: string;
  content: MessageContent;   // text / image / voice / file
  timestamp: number;
}
```

### 子进程架构

- 每个 Channel 一个独立 Node.js 子进程（`fork()`）
- 通过 Unix Socket 与核心进程通信（比 TCP 开销低）
- Channel 崩溃 → Process Manager 自动重启 → 重新连接平台
- 不活跃的 Channel 可配置自动休眠（释放内存）

### 初期支持的 Channel

| Channel | 底层库 | 说明 |
|---|---|---|
| WhatsApp | Baileys | 修复 OpenClaw 的 old-style JID 丢消息问题 |
| Telegram | grammY | 支持 Bot API + 群组隔离 |
| Slack | Bolt | Socket Mode，无需公网 URL |
| Discord | discord.js | 支持 slash commands |

### 扩展方式

新 Channel 只需实现 `ChannelAdapter` 接口，放到 `channels/` 目录即可自动发现加载。

## 5. Agent 执行引擎

### 隔离策略（分级）

```
Level 0: 直接子进程（开发模式，最快但无隔离）
Level 1: Docker 容器（默认，跨平台）
Level 2: Apple Container（macOS 原生，更轻量）
```

用户在配置中选择隔离级别，默认 Level 1。

### Agent 生命周期

```
消息到达 → 查找/创建会话 → 启动容器（如不存在）
→ 挂载会话专属文件系统 → 调用 LLM → 返回结果
→ 空闲超时 → 自动销毁容器（释放内存）
```

### 内存优化

| 策略 | 效果 |
|---|---|
| Agent 容器空闲超时销毁 | 不活跃会话零内存占用 |
| Channel 按需加载 | 4 个 Channel 全开 ~80MB，只开 1 个 ~35MB |
| 核心进程精简依赖 | 目标 <30MB（OpenClaw 核心 ~150MB） |
| LLM SDK 懒加载 | 只在首次调用时加载对应模型的 SDK |
| 消息队列溢出写磁盘 | 高并发时不会撑爆内存 |

### 多模型支持

```typescript
interface LLMProvider {
  name: string;
  chat(messages: Message[], tools?: Tool[]): AsyncIterable<Chunk>;
  countTokens(text: string): number;  // 允许近似值，无精确 tokenizer 时按字符数估算
}
```

内置 Provider：Claude（Anthropic SDK / Agent SDK）、OpenAI、DeepSeek、Ollama（本地模型）。

**LLM 调用容错**：
- 重试策略：指数退避，最多 3 次（429/5xx 触发）
- 流式中断：向用户发送已收到的部分响应 + 错误提示
- 可配置 fallback 模型：主模型连续失败 N 次后自动切换备用模型
- 单次调用超时：可配置，默认 120 秒

模型配置按会话粒度——不同群组/对话可以用不同模型。

### Agent 沙箱权限模型

```typescript
interface AgentPermissions {
  allowedCommands: string[];    // ["ls", "cat", "node", ...]
  blockedPaths: string[];       // ["/etc", "/usr", "~/.ssh", ...]
  networkAccess: boolean;       // 是否允许网络请求
  maxExecutionTime: number;     // 单次执行超时（秒）
  maxMemory: number;            // 容器内存上限
}
```

每个群组/会话可配置独立权限，最小权限原则。

## 6. 记忆与持久化系统

### 存储层

```
本地部署 → SQLite（WAL 模式，防崩溃损坏）
服务器部署 → PostgreSQL
自动检测：有 PG 连接串用 PG，否则 SQLite
```

### 记忆架构

```
┌──────────────────────────────────────┐
│           Memory Manager             │
│  ┌────────┐ ┌────────┐ ┌──────────┐ │
│  │短期记忆 │ │长期记忆 │ │会话上下文 │ │
│  │(最近N轮)│ │(语义检索)│ │(per group)│ │
│  └───┬────┘ └───┬────┘ └────┬─────┘ │
│      └──────────┴───────────┘       │
│              ▼                       │
│    ┌──────────────────┐              │
│    │ Storage Adapter   │              │
│    │ SQLite / PG       │              │
│    └──────────────────┘              │
└──────────────────────────────────────┘
```

### 解决 OpenClaw 问题

| OpenClaw 问题 | 解法 |
|---|---|
| 崩溃后记忆损坏（单文件写入中断） | SQLite WAL 模式 + 事务写入，原子性保证 |
| 记忆无限增长，性能劣化 | 可配置 `maxEntries`，自动按相关性淘汰旧记忆 |
| 全量加载上下文导致 token 溢出 | 检索式加载：短期记忆全量 + 长期记忆按语义相关性 top-K |
| 重启后记忆丢失（memoryFlush 默认开启） | 默认持久化，无 flush 选项 |
| 高 token 消耗（3-5x 冗余） | 记忆压缩：定期合并相似记忆，减少检索结果冗余 |

### 语义检索

- 本地模式：Ollama 跑小型 embedding 模型（如 nomic-embed-text）
- 云端模式：OpenAI / Voyage embedding API
- **降级策略**：无 embedding 服务可用时，自动降级为关键词匹配（BM25），功能不中断但检索质量下降，日志 warn 提示用户配置 embedding
- 存储在 SQLite 的 `vec0` 虚拟表或 PG 的 `pgvector`

**记忆淘汰策略**：`pruneStrategy: "relevance"` 基于以下信号加权打分：最后访问时间（40%）、访问频次（30%）、语义与活跃会话的相关性（30%）。不依赖 embedding 调用——使用已存储的向量计算，无额外成本。

每个群组/会话完全隔离——独立的记忆空间，互不干扰。

## 7. 安全体系

### 认证与访问控制

```
首次启动 → 强制生成 API Key（不允许跳过）
        ↓
  ┌───────────────┐
  │  认证中间件     │
  │  API Key 校验  │
  │  Rate Limiter  │←── localhost 也限速
  │  Origin 校验   │←── WebSocket 必须校验 Origin
  └───────────────┘
```

### 安全措施对照

| OpenClaw 安全问题 | JalenClaw 解法 |
|---|---|
| 默认无认证暴露 | 首次启动强制设置凭证，无凭证不启动 |
| 明文存储 API Key | 优先使用系统 keychain（macOS Keychain / Linux libsecret），环境变量 `${VAR}` 作为备选（CI/Docker 场景），配置文件中不存储明文密钥 |
| localhost 不限速被爆破 | 所有来源统一 rate limit |
| WebSocket 无 Origin 校验 | 严格校验 + 可配置白名单 |
| 恶意 Skills | 本地技能系统，无远程市场；技能运行在沙箱内 |
| exec 权限过大 | 默认沙箱模式，命令白名单 + 路径黑名单 |
| 无 TLS | 内置 `--tls` 选项自动生成自签证书 |

### 安全审计日志

所有敏感操作（认证、命令执行、文件访问）记录到独立日志文件，支持 JSON 格式输出。

## 8. 技能系统（Skills）

### 技能定义

技能是一个目录，包含一个 `SKILL.md` 描述文件和可选的脚本/资源：

```
skills/
├── web-search/
│   ├── SKILL.md          # 名称、描述、触发条件、所需权限
│   └── handler.ts        # 技能逻辑（可选，也可纯提示词）
├── code-review/
│   └── SKILL.md
```

### 技能接口

```typescript
interface Skill {
  name: string;
  description: string;
  triggers: string[];         // 触发关键词，如 ["review", "代码审查"]
  requiredPermissions: string[]; // ["network", "filesystem:read"]
  execute(context: SkillContext): AsyncIterable<string>;
}
```

### 生命周期

1. 启动时扫描 `~/.jalenclaw/skills/` 和项目级 `skills/` 目录
2. 解析 `SKILL.md` 注册到技能表（不加载实现代码）
3. 消息匹配触发条件时，懒加载并执行
4. 技能在 Agent 沙箱内运行，受 `AgentPermissions` 约束

### 安全约束

- 仅支持本地安装，无远程市场
- 技能运行在与 Agent 相同的沙箱隔离级别中
- 技能声明所需权限，超出 Agent 权限的请求会被拒绝

## 9. IPC 协议

### 核心进程 ↔ 子进程通信

- **传输层**：Unix Domain Socket（路径 `~/.jalenclaw/run/<service>.sock`）
- **序列化**：JSON + 换行符分隔（JSON Lines），兼顾可读性与简单性
- **握手**：子进程连接后发送 `{"type":"hello","service":"channel:whatsapp","pid":1234}`，核心回复 `{"type":"ack"}`
- **背压**：核心进程队列满时回复 `{"type":"backpressure","retryAfterMs":100}`，子进程暂停发送

### 消息帧格式

```json
{"type":"message","id":"uuid","payload":{...}}\n
{"type":"ack","id":"uuid"}\n
{"type":"error","id":"uuid","code":"TIMEOUT","detail":"..."}\n
```

## 10. 配置与部署系统

### 配置文件 `jalenclaw.yml`

```yaml
gateway:
  host: "127.0.0.1"
  port: 18900
  tls: false

agent:
  isolation: "docker"      # "docker" | "apple-container" | "process"
  idleTimeout: 300
  maxMemory: 256

models:
  default: "claude"
  providers:
    claude:
      apiKey: "${ANTHROPIC_API_KEY}"
    openai:
      apiKey: "${OPENAI_API_KEY}"

channels:
  whatsapp:
    enabled: true
  telegram:
    enabled: false
    botToken: "${TELEGRAM_BOT_TOKEN}"

memory:
  backend: "auto"          # "auto" | "sqlite" | "postgres"
  maxEntries: 10000
  pruneStrategy: "relevance"

rateLimit:
  maxRequestsPerMinute: 60   # 每 IP 每分钟
  burstSize: 10               # 突发容忍
```

### 配置管理

- 固定路径 `~/.jalenclaw/jalenclaw.yml` + `--config` 覆盖
- 配置版本号 + `jalenclaw config migrate` 自动迁移
- 不提供示例值，启动时校验密钥格式/长度
- 环境变量引用（`${VAR_NAME}`），敏感信息不写入文件
- 所有路径解析为绝对路径

### CLI 工具

```bash
jalenclaw start              # 启动（前台）
jalenclaw start -d           # 后台守护进程
jalenclaw stop               # 优雅停止
jalenclaw status             # 查看各子进程状态 + 内存占用
jalenclaw logs               # 结构化日志
jalenclaw config migrate     # 升级后迁移配置
jalenclaw backup create      # 快照（配置 + 记忆 + 会话）
jalenclaw backup restore     # 回滚
jalenclaw doctor             # 诊断：检查端口、权限、配置风险
```

### 部署方式

| 场景 | 方式 |
|---|---|
| macOS 本地 | `launchd` plist，开机自启 |
| Linux 本地/服务器 | `systemd` unit |
| Docker | `docker-compose.yml`，含 PG + JalenClaw |
| 手动 | `jalenclaw start -d` |

## 11. 可观测性与运维

### 结构化日志

```json
{
  "level": "info",
  "time": "2026-03-13T10:00:00.000Z",
  "service": "channel:whatsapp",
  "event": "message_received",
  "senderId": "86138xxxx",
  "groupId": "default",
  "latencyMs": 42
}
```

- 按服务分文件：`core.log`、`channel-whatsapp.log`、`agent.log`
- 自动轮转（按大小 + 天数）
- 运行时动态调整日志级别

### 健康监控

```
GET /health    → 核心进程 + 各子进程状态
GET /metrics   → Prometheus 格式指标（可选开启）
```

关键指标：内存占用、消息延迟、Agent 容器数量、LLM token 消耗、Channel 连接状态。

### 告警（可选）

- 内存超阈值 → 日志 warn + 可配置 webhook 通知
- Channel 连续重启 → 自动禁用 + 通知
- LLM API 错误率飙升 → 通知

## 12. 测试策略

- **单元测试**：Vitest，覆盖 Router、Memory Manager、Config Loader 等核心模块
- **集成测试**：真实 SQLite/PG 数据库，测试记忆存取和迁移
- **E2E 测试**：模拟 Channel 消息 → Agent 响应 → 出站消息的完整链路
- **安全测试**：验证无认证拒绝、rate limit 生效、Origin 校验、沙箱命令隔离
- **CI**：GitHub Actions，PR 必须通过 lint + typecheck + 全部测试

## 13. 项目目录结构

```
jalenclaw/
├── src/
│   ├── index.ts              # CLI 入口
│   ├── gateway/
│   │   ├── server.ts         # HTTP/WS 服务
│   │   ├── auth.ts           # 认证中间件
│   │   └── rate-limiter.ts   # 限速
│   ├── router/
│   │   ├── router.ts         # 消息路由
│   │   └── queue.ts          # 消息队列
│   ├── process/
│   │   ├── manager.ts        # 子进程管理
│   │   └── health.ts         # 健康检查
│   ├── channels/
│   │   ├── interface.ts      # ChannelAdapter 接口
│   │   ├── whatsapp/         # WhatsApp 适配器
│   │   ├── telegram/         # Telegram 适配器
│   │   ├── slack/            # Slack 适配器
│   │   └── discord/          # Discord 适配器
│   ├── agent/
│   │   ├── runner.ts         # Agent 执行引擎
│   │   ├── container.ts      # 容器管理
│   │   └── permissions.ts    # 沙箱权限
│   ├── models/
│   │   ├── interface.ts      # LLMProvider 接口
│   │   ├── claude.ts
│   │   ├── openai.ts
│   │   ├── deepseek.ts
│   │   └── ollama.ts
│   ├── memory/
│   │   ├── manager.ts        # Memory Manager
│   │   ├── sqlite.ts         # SQLite 适配器
│   │   ├── postgres.ts       # PostgreSQL 适配器
│   │   └── embedding.ts      # 语义检索
│   ├── observability/
│   │   ├── logger.ts         # 结构化日志
│   │   └── metrics.ts        # Prometheus 指标
│   ├── skills/
│   │   ├── interface.ts      # Skill 接口
│   │   ├── loader.ts         # 技能发现与懒加载
│   │   └── registry.ts       # 技能注册表
│   ├── ipc/
│   │   ├── socket.ts         # Unix Socket 通信
│   │   └── protocol.ts       # JSON Lines 协议
│   └── config/
│       ├── schema.ts         # 配置 schema（Zod）
│       ├── loader.ts         # 配置加载
│       └── migrate.ts        # 配置迁移
├── container/
│   └── Dockerfile            # Agent 容器镜像
├── skills/                   # 本地技能目录
├── tests/                    # 测试目录
├── docs/
├── package.json
├── tsconfig.json
└── jalenclaw.yml             # 默认配置示例
```
