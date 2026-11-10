# PythonAgent 实现计划

> 执行：当前会话逐任务实现并独立审查；用户已批准设计与继续实现。

**目标：** 提供 uv 启动的模块化 FastAPI、双数据库连接和 Apifox 契约。
**架构：** core 负责配置异常，infrastructure 管理连接，modules 封装业务，scripts 显式初始化。
**技术栈：** Python 3.12、FastAPI、SQLAlchemy、psycopg、pgvector、HTTPX、pytest、Ruff。

## 任务 1：项目配置
- [x] 创建 pyproject.toml、.python-version、.gitignore、.env.example。
- [x] 执行 uv sync，验证 Python 3.12 和锁文件。

## 任务 2：统一返回和生命周期（TDD）
文件：app/main.py、app/core/config.py、app/core/errors.py、app/core/middleware.py、app/common/schemas.py、app/infrastructure/database.py；测试 tests/test_api.py。
- [x] 先编写存活响应、404、405、422、500、OpenAPI、配置测试，执行 uv run pytest 确认缺少实现而失败。
- [x] Settings 用 SecretStr 保存 URL；连接池使用 psycopg，生命周期只建池不执行 DDL；关闭两套池。
- [x] 使用泛型 ApiResponse，异常返回安全消息；服务生成 UUID 请求 ID。
- [x] 执行 uv run pytest tests/test_api.py -q，预期所有断言通过。

## 任务 3：用户与向量模块（TDD）
文件：app/modules/{users,documents,health}/{router,schemas,service,models}.py、app/infrastructure/embeddings.py；测试 tests/test_users.py、tests/test_vectors.py。
- [x] 先验证分页、重复邮箱、文档创建、检索、非法向量、上游错误和就绪检查的失败测试。
- [x] 用户表 pythonagent_users 与文档表 pythonagent_documents 独立，不引用原表。
- [x] 使用异步事务，重复邮箱仅捕获唯一约束冲突；向量必须维度匹配、有限且非零。
- [x] 通过依赖注入在单测替换连接，上游用 HTTPX MockTransport；不接触真实数据库。
- [x] 执行 uv run pytest -q，预期全部通过。

## 任务 4：脚本与文档
文件：scripts/{init_db,check_connections,export_openapi}.py、compose.yaml、README.md、docs/apifox.md。
- [x] init_db 必须显式 --yes 才新增扩展和项目表；不自动执行。
- [x] check_connections 只读 SELECT，连接或扩展缺失以非零退出。
- [x] 导出 OpenAPI 无需连接数据库；文档包含 uv、初始化、导入 Apifox 与接口示例。
- [x] 仅复制参考 .env 的 DATABASE_URL、RAG_DATABASE_URL、OLLAMA_BASE_URL 到被忽略的 .env，权限 600。

## 验收
- [x] uv run ruff check . 与 uv run ruff format --check . 均退出 0。
- [x] uv run pytest -q 全部通过。
- [x] uv run python -m scripts.export_openapi 生成正确 schema。
- [x] uv run python -m scripts.check_connections 真实只读检查；报告实际状态。
- [x] 临时启动 uvicorn，HTTP 验证 live、ready、openapi 后关闭。
- [x] 独立代码审查，修复高置信问题并重新验证。

Git 提交不自动执行，保留用户工作树；不切换父仓库分支。项目目录是用户指定的新增隔离目录。
