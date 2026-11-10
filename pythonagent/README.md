# PythonAgent

模块化 FastAPI 项目，使用 uv 管理依赖，连接 PostgreSQL 和 pgvector，通过 Ollama 生成文本向量，支持 Apifox 导入与同步。

## 快速启动

要求：uv、Python 3.12（uv 可自动安装）、可访问的 PostgreSQL/pgvector 和 Ollama。

```bash
cd /Users/jiangheng/Desktop/aigent/pythonagent
uv sync --locked
# 首次从零配置才执行，已有 .env 不要覆盖
test -f .env || cp .env.example .env
# 编辑 .env 后，只读检查连接
uv run python -m scripts.check_connections --embeddings
# 仅全新环境需要初始化；已有 User 表无需重复建表，不删除或清空数据
uv run python -m scripts.init_db --yes
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

本次搭建已从参考项目仅复用 DATABASE_URL、RAG_DATABASE_URL、OLLAMA_BASE_URL 到本地 .env；不要再次覆盖。没有复制聊天 API 密钥。

- Swagger：http://127.0.0.1:8000/docs
- ReDoc：http://127.0.0.1:8000/redoc
- OpenAPI：http://127.0.0.1:8000/openapi.json
- [Apifox 配置说明](docs/apifox.md)

## 目录职责

```text
app/
  main.py                   应用工厂、生命周期、路由
  core/                     环境配置、错误处理、请求追踪
  common/schemas.py         泛型统一响应、分页模型
  infrastructure/           双数据库连接池、Ollama embedding
  modules/
    health/router.py        存活和依赖就绪检查
    users/                  用户模型、校验、服务、路由
    documents/              文档向量模型、校验、服务、路由
scripts/                    显式初始化、只读检查、OpenAPI 导出
tests/                      无外部依赖测试
compose.yaml                可选本地 pgvector 数据库
```

新增模块时独立组织 models.py、schemas.py、service.py、router.py，在应用工厂注册路由。使用 business_session / vector_session 注入会话，不在路由直接创建连接。

## 接口

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | /api/v1/health/live | 只验证进程存活，不访问数据库 |
| GET | /api/v1/health/ready | 验证两个连接、vector 扩展、项目表与向量维度 |
| POST | /api/v1/users | 创建用户，邮箱不区分大小写 |
| GET | /api/v1/users?page=1&page_size=20 | 分页查询，data 直接返回用户数组，不嵌套 items 或分页元数据 |
| POST | /api/v1/documents | 生成 embedding 并保存文档 |
| POST | /api/v1/documents/search | 余弦相似度检索，score 越大越相似 |

```bash
curl -X POST http://127.0.0.1:8000/api/v1/users \
  -H "Content-Type: application/json" \
  -d '{"name":"Alice","email":"alice@example.com"}'
curl -X POST http://127.0.0.1:8000/api/v1/documents \
  -H "Content-Type: application/json" \
  -d '{"text":"FastAPI 使用 Python 构建 API","metadata":{"source":"demo"}}'
curl -X POST http://127.0.0.1:8000/api/v1/documents/search \
  -H "Content-Type: application/json" \
  -d '{"query":"Python API 框架","limit":5}'
```

统一 JSON：

```json
{"code":0,"message":"success","data":{},"request_id":"服务生成的 UUID"}
```

文本入库和检索不会静默截断：发送 truncate=false，超过 embedding 模型上下文时返回安全的 503，不写入文档。当前示例不自动分块，长文请先按模型上下文切分；字符上限不等于模型 token 上限。

成功 code=0；错误 code 等于 HTTP 状态码。HTTP 状态真实保留（201、404、405、409、422、503、500）。X-Request-ID 与响应体一致，不信任来访请求的 ID。参数错误 data.errors 仅包含字段位置、类型和安全消息；内部错误不输出 SQL、原始输入或凭据。Swagger、ReDoc、OpenAPI 不包装业务结构。

## 配置与数据安全

| 环境变量 | 含义 |
|---|---|
| DATABASE_URL | 业务 PostgreSQL 地址 |
| RAG_DATABASE_URL | 向量 PostgreSQL 地址，可与业务库相同 |
| OLLAMA_BASE_URL | Ollama 服务地址，仅管理员配置，不接受请求覆盖 |
| EMBEDDING_MODEL | 默认 mxbai-embed-large:latest |
| EMBEDDING_DIMENSION | 默认 1024，必须与模型和表一致 |
| DB_TIMEOUT_SECONDS | 连接/查询超时，默认 5 秒 |
| OLLAMA_TIMEOUT_SECONDS | embedding 请求超时，默认 30 秒 |

用户模块复用原项目的 public."User" 表，GET /api/v1/users 读取现有用户，POST /api/v1/users 也会新增到同一张共享表。id 使用文本类型（不要求历史 ID 是 UUID），数据库 createdAt 映射到接口 created_at，name 允许 null。向量仍使用独立 public.pythonagent_documents，不改动原 langchain_pg_embedding 表。原 pythonagent_users 表保留但不再使用，不自动迁移或删除数据。启动只建立惰性连接池，不执行 DDL。init_db 是增量初始化工具，不是生产迁移系统；后续表结构变化应采用受控迁移，create_all 不会更新已有表。修改维度或模型后不要混用旧向量，必须显式规划新表/迁移和重新生成向量。向量维度不超过 2000 时初始化 HNSW 余弦索引，更大维度回退精确检索。

.env 已被 Git 忽略，应限制为 600 权限，不要提交；生产通过部署环境注入凭据。当前没有鉴权，写入接口仅供受信任开发环境，勿直接暴露公网。

### 可选独立本地数据库

```bash
docker compose up -d
```

绑定 127.0.0.1:5433，默认用户名/密码 postgres、数据库 pythonagent。仅用于本地开发，与参考项目服务端口隔离。使用前将 .env 改为 .env.example 中的本地地址；不会自动启动 Docker 或下载 Ollama 模型。独立本地 Ollama 可执行 `ollama pull mxbai-embed-large:latest`，不要更改共享 Ollama。

## 开发验证

```bash
uv run pytest -q
# 可选：真实服务联调，写入始终在外层事务回滚并验证未持久化
PYTHONAGENT_LIVE_TESTS=1 uv run pytest tests/test_live_integration.py -q
uv run ruff check .
uv run ruff format --check .
uv run python -m scripts.export_openapi
uv run python -m scripts.check_connections --embeddings
```

pytest 默认不连接真实服务；用户服务测试使用 SQLite 内存库，上游 embedding 使用 HTTPX MockTransport。真实检查为只读 SQL，--embeddings 额外生成一个无敏感内容的测试向量；任何缺失依赖/表都会返回退出码 1。初始化只有带 --yes 才执行新增 DDL，未确认时退出码 2。
