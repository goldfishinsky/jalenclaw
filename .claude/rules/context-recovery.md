---
description: Always apply when starting a new conversation or resuming work
globs: "**/*"
---

# Context Recovery Protocol

当你在新会话中被要求继续 JalenClaw 的开发工作时：

1. **读 CLAUDE.md** — 了解项目概况和开发规则
2. **读 docs/progress.md** — 了解哪些步骤已完成、当前在哪一步
3. **读当前步骤的 plan 文件** — `docs/superpowers/plans/` 中对应编号的文件
4. **读相关 spec** — 如果 plan 引用了 spec 中的设计细节
5. **检查 git log** — `git log --oneline -10` 了解最近的改动
6. **继续工作** — 从 progress.md 标记的当前步骤继续

## 进度文件格式

`docs/progress.md` 是唯一的进度真相来源。格式：

```markdown
## Current Step
Step X: <name> — IN PROGRESS / BLOCKED

## Completed Steps
- [x] Step 1: <name> — <commit hash>
- [x] Step 2: <name> — <commit hash>

## Notes
<任何跨会话需要传递的信息>
```

## 关键原则

- 不要依赖上一次会话的上下文——所有信息都在文件中
- 如果 progress.md 和代码状态不一致，以代码状态为准
- 如果不确定当前状态，先跑 `pnpm test` 和 `git status` 确认
