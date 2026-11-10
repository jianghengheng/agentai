# PythonAgent FastAPI 项目设计

日期：2026-11-10

## 目标
在 `/Users/jiangheng/Desktop/aigent/pythonagent` 创建可通过 uv 管理和启动的模块化 FastAPI 项目，接入 PostgreSQL、pgvector，提供统一接口返回和 Apifox OpenAPI 对接。参考项目只读，不修改其代码、数据库表或现有向量数据。

## 方案比较
1. 推荐：PostgreSQL + pgvector，沿用参考项目的基础设施，Python 使用 SQLAlchemy 2 异步 ORM 和 psycopg 3。部署依赖少，业务与向量连接可分别配置。
2. PostgreSQL + Qdrant：向量服务独立，但新增部署维护成本，不符合当前参考项目。
3. 全面搬迁 NestJS 的 RAG、对话模型和 LangGraph：范围过大，当前不实施。

## 模块与职责
- app/main.py：应用工厂、路由注册和 lifespan 资源生命周期。
- app/core/：Pydantic Settings、日志、请求追踪、异常处理。
- app/common/：泛型响应与分页模型，不通过中间件盲目包装所有响应。
- app/infrastructure/：独立业务数据库与向量数据库异步连接池、Ollama embedding 客户端。
- app/modules/health/：进程存活与依赖就绪检查。
- app/modules/users/：独立用户表的创建、分页查询示例，router/schema/service/model 分离。
- app/modules/documents/：独立向量表的文本入库和余弦相似度检索，router/schema/service/model 分离。
- scripts/：显式初始化数据库、导出 OpenAPI、只读连接检查。
- tests/：不依赖外部服务的契约与单元测试，以及显式启用的真实连接验证。

## 依赖和运行
使用稳定 Python 3.12，uv 管理 pyproject.toml、uv.lock 和 .python-version。依赖包括 FastAPI、Uvicorn、SQLAlchemy、psycopg、pgvector、Pydantic Settings、HTTPX；开发依赖包括 pytest、pytest-asyncio、Ruff。启动命令：`uv run uvicorn app.main:app --reload`。提供可选 Docker Compose PostgreSQL/pgvector 本地环境，不自动启动或覆盖已有服务。

## 连接与数据安全
本地 .env 从参考项目仅复用 DATABASE_URL、RAG_DATABASE_URL、OLLAMA_BASE_URL，不复制聊天 API 密钥。真实配置被 Git 忽略，示例配置只包含占位值；不在日志或文档输出密码。业务表使用 pythonagent_users，向量表使用 pythonagent_documents；绝不复用参考项目 User、langchain_pg_embedding 等表。向量维度默认 1024，模型默认 mxbai-embed-large:latest，通过环境变量调整；维度变化必须显式迁移或使用新表。向量表包含 UUID、document、metadata、embedding。

服务启动仅创建连接池，不执行 DDL。显式初始化命令负责确保 vector 扩展和创建新表，不删除、不清空、不修改现有表；对既有数据库执行前说明新增影响并获得授权。验证默认先进行只读连接检查；写入验证使用事务回滚或独立测试数据库，不向原项目表写数据。

## API 与数据流
路由前缀 /api/v1。GET /health/live 仅返回进程状态，GET /health/ready 分别验证业务库 SELECT 1、向量库 SELECT 1 和 vector 扩展，失败返回 HTTP 503。POST /users 创建示例用户，GET /users 分页查询，重复邮箱返回 409。POST /documents 先向固定 Ollama 地址请求 embedding，校验有限数值、维度和非零向量后事务写入新向量表。POST /documents/search 生成查询向量，再在向量数据库执行余弦距离排序并返回匹配文档及分数。只提供向量检索，不实现聊天生成、LangGraph 或鉴权。示例写入接口不具备认证，文档明确仅用于受信任的开发环境。

## 响应与异常
成功结构为 `{ "code": 0, "message": "success", "data": ..., "request_id": "..." }`。请求追踪由服务生成并通过 X-Request-ID 返回；错误保留正确 HTTP 状态码，涵盖 404、405、409、422、503、500。未知异常不对客户端暴露堆栈、SQL 和连接信息。请求校验错误移除原始输入和内部上下文，只返回字段位置、类型和安全消息。OpenAPI、Swagger、ReDoc 不做业务响应包装。

## Apifox
FastAPI 原生 /openapi.json 作为文档源，/docs 提供 Swagger，/redoc 提供 ReDoc。为成功和常见错误声明与真实 JSON 一致的响应模型，提供 tags、operation_id 和中文摘要。支持 `uv run python -m scripts.export_openapi` 导出 openapi.json，无需数据库连接。文档说明 Apifox 从 URL/文件导入、配置本地环境 BASE_URL 和手动/定时同步。当前不配置远程 Apifox 项目，也不需要访问 Token。

## 测试与验收
执行 uv sync、Ruff 检查、pytest；覆盖成功结构、404/405、422、409、异常脱敏、追踪头、分页边界、向量维度与非法向量、Ollama 失败、依赖检查和 OpenAPI 契约。真实只读验证报告两套数据库连接和 pgvector 扩展状态；真实依赖无法访问时明确记录，不声称已经连通。启动 HTTP 冒烟检查应由临时测试进程完成并在结束后关闭，不遗留后台服务。

## 自检结论
范围聚焦 Python 项目脚手架与两种存储接入；不迁移原项目业务；所有数据库 DDL 与写入均显式执行；未包含任何真实凭据；无未决实现占位符。
