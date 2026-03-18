# JalenClaw

一个类 OpenClaw 的多通道 AI 助手平台。当前处于**初始开发阶段**——从 OAuth 认证模块开始构建。

## 关键文档

- **总体设计**: `docs/superpowers/specs/2026-03-13-jalenclaw-design.md`
- **OAuth 认证设计**: `docs/superpowers/specs/2026-03-18-claude-oauth-subscription.md`
- **实施计划**: `docs/superpowers/plans/` (按步骤编号)
- **进度追踪**: `docs/progress.md` — 每完成一个步骤必须更新

## 开发规则

### TDD 流程（强制）

1. 先写测试，再写实现
2. 每个模块必须有对应的 `*.test.ts` 文件
3. 运行 `npm test` 全部通过后才能提交
4. 运行 `npm run typecheck` 通过后才能提交

### 逐步推进（强制）

- 按 `docs/superpowers/plans/` 中的步骤顺序执行
- 一次只做一个步骤，不要跳步
- 每完成一个步骤：更新 `docs/progress.md`，提交代码
- 如果一个步骤太大，拆分成子步骤再执行

### 上下文恢复（重要）

新会话开始时，按以下顺序读取恢复上下文：
1. 读 `CLAUDE.md`（本文件）
2. 读 `docs/progress.md` 了解当前进度
3. 读当前步骤对应的 plan 文件
4. 读相关的 spec 文件（如需要）
5. 继续未完成的工作

### 代码规范

- TypeScript 严格模式
- 测试框架：Vitest
- 日志：pino
- 配置校验：Zod
- 包管理器：pnpm

### Git 规范

- 不要在 commit message 中包含 AI 署名
- 每个步骤完成后单独提交
- commit message 格式：`<type>(<scope>): <description>`
  - type: feat, fix, test, chore, docs, refactor
  - scope: auth, config, models, gateway, etc.

## 命令速查

```bash
pnpm install          # 安装依赖
pnpm test             # 运行测试
pnpm run typecheck    # 类型检查
pnpm run lint         # 代码检查
pnpm run lint:fix     # 自动修复
```
