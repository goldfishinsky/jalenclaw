---
description: Apply when creating or modifying test files
globs: tests/**/*.test.ts
---

# Testing Rules

## 测试文件组织

```
tests/
├── unit/           # 单元测试（mock 外部依赖）
│   ├── auth/
│   ├── config/
│   └── models/
├── integration/    # 集成测试（真实文件系统、真实 HTTP）
│   └── auth/
└── helpers/        # 测试工具函数
    └── index.ts
```

## 测试命名

- 文件名与源文件对应：`src/auth/token-store.ts` → `tests/unit/auth/token-store.test.ts`
- describe 块使用模块名
- it/test 块描述行为，不描述实现

## 测试覆盖要求

每个模块至少覆盖：
- 正常路径（happy path）
- 边界情况（空输入、极值等）
- 错误情况（文件不存在、网络失败、无效数据等）

## 测试隔离

- 每个测试使用临时目录（`fs.mkdtemp`），测试后清理
- 不依赖全局状态
- HTTP 测试使用随机端口
