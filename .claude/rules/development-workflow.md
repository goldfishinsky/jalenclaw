---
description: Enforced when writing or modifying any source code in src/
globs: src/**/*.ts
---

# Development Workflow Rules

## TDD 是强制的

对于 `src/` 下的每个模块：

1. 先在 `tests/` 下创建对应的测试文件
2. 写测试用例（覆盖正常路径 + 边界情况 + 错误情况）
3. 运行测试确认失败（红）
4. 写实现代码
5. 运行测试确认通过（绿）
6. 如有需要，重构（重构后再跑一次测试）

## 完成检查清单

每个步骤完成前必须确认：

- [ ] `pnpm test` 全部通过
- [ ] `pnpm run typecheck` 无错误
- [ ] `pnpm run lint` 无错误
- [ ] `docs/progress.md` 已更新
- [ ] 代码已提交
- [ ] 推送到远程：`git push`

## 不要做的事

- 不要跳过测试直接写实现
- 不要一次实现多个步骤
- 不要修改不在当前步骤范围内的代码
- 不要在没有测试覆盖的情况下提交代码
