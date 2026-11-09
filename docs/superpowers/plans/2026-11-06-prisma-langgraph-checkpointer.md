# Prisma 与 LangGraph Checkpointer 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。

**目标：** 让 NestJS 统一管理 Prisma 数据库客户端和 LangGraph `PostgresSaver`，并使 LangGraph Service 能通过依赖注入复用 checkpointer。

**架构：** `db.ts` 只负责创建连接资源，不在工厂函数中启动异步初始化。`PrismaService.onModuleInit()` 先连接 Prisma，再等待 `checkpointer.setup()`；关闭时释放两个连接池。业务 Service 继续注入 `PrismaService`，通过 `prisma.db` 查询，通过 `prisma.checkpointer` 编译 LangGraph。

**技术栈：** NestJS 12、Prisma 8 contract runtime、`@langchain/langgraph`、`@langchain/langgraph-checkpoint-postgres`、PostgreSQL。

---

### 任务 1：集中创建数据库资源

**文件：**
- 修改：`project-name/src/prisma/db.ts`
- 修改：`project-name/src/prisma/prisma.service.ts`

- [x] 从 `db.ts` 导出 `createCheckpointer()`，保留 `createDatabase()` 的现有返回类型。
- [x] 从 `createDatabase()` 移除未等待的 `checkpointer.setup()`。
- [x] 在 `PrismaService` 增加 `readonly checkpointer`，在 `onModuleInit()` 等待 `db.connect()` 和 `checkpointer.setup()`。
- [x] 在 `onApplicationShutdown()` 调用 `checkpointer.end()` 和 `db.close()`。

### 任务 2：让 LangGraph 使用注入的 checkpointer

**文件：**
- 修改：`project-name/src/langgraph/langgraph.service.ts`

- [x] 保留现有 LangGraph 草稿和用户未完成的节点逻辑。
- [x] 在实际 `StateGraph.compile()` 时传入 `this.prisma.checkpointer`。
- [x] 保证调用图时提供 `configurable.thread_id`，否则 PostgreSQL checkpointer 无法按会话持久化状态。

### 任务 3：验证生命周期与构建

**文件：**
- 检查：`project-name/src/prisma/prisma.module.ts`
- 检查：`project-name/src/app.module.ts`

- [x] 确认 `PrismaModule` 已导出 `PrismaService` 且由 `AppModule` 导入。
- [x] 运行 `pnpm run build`。
- [x] 运行与 Prisma/LangGraph 相关的测试或最小 TypeScript 类型检查，确认没有异步初始化和类型错误。
