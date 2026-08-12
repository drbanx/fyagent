# 实施前继承文件保护基线

- 记录日期：2026-08-12
- 基线类型：工作树内容 Git blob hash（设计冻结前）
- 用途：这些文件是本任务现场已有且必须保留的有效成果；三个执行 Agent 与后续页面修复不得改写。最终验收重新计算并逐项比对。
- 证据等级：`code_audit`
- 本记录未运行测试、构建、服务或浏览器。

| 文件 | Git blob hash |
| --- | --- |
| `src/index.html` | `c5ff9932f285285559f2d4cb5ac20375e8973aa4` |
| `package.json` | `b81bef412f8c7de66613dfa24123f9f7dbe949f9` |
| `playwright.v2.config.ts` | `5ee748a99cf16254d1e14f57ce4955451a3544e6` |
| `src/v2/app/styles/tokens.css` | `7ec796965df53ffc4b2ef5c1a73a24cf100e1a17` |
| `src/v2/app/styles/globals.css` | `ffe6e3059e3a410ce46b6489960772ce7358a068` |
| `src/v2/app/styles/index.css` | `87b8ee6087029a10c0984c711811eaed2fb9823b` |
| `src/v2/app/styles/v4-shell.css` | `a5c31b254ccb81568b567fb778beebbdc909cef6` |
| `tests/v2/app/router-shell.test.tsx` | `abcb3d186514089d42520e33503b90c4c1e2416d` |
| `tests/v2-browser/shell.spec.ts` | `24f35fb5500907d91eb73dfec79f7de99386a9e9` |

这些 hash 只证明冻结时内容，不替代 baseline-to-HEAD、worktree、untracked 和逐提交文件清单审计。
