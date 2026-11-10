# Apifox 对接

本项目以 FastAPI 路由和 Pydantic 模型生成 OpenAPI，统一返回结构同时出现在文档和真实响应中，不需要手动维护两套接口定义。

## 从 URL 导入或定时同步（推荐）

1. 启动：`uv run uvicorn app.main:app --reload`。
2. 打开 Apifox 目标项目，进入项目设置中的数据管理/导入数据（不同客户端版本名称可能不同）。
3. 选择 OpenAPI/Swagger，使用 URL `http://127.0.0.1:8000/openapi.json`。
4. 检查预览后导入；需要自动更新时，在该项目配置相同 URL 的定时导入。定时执行所在客户端/代理必须能访问此地址。
5. 在 Apifox 本地环境中将服务前置 URL 设置为 `http://127.0.0.1:8000`；接口路径已经带 /api/v1，不要重复添加前缀。
6. 修改路由或模型后保存，开发服务重载，再执行导入/同步。是否覆盖已有人工修改请按项目协作规范选择，先审查预览。

## 从文件导入

```bash
uv run python -m scripts.export_openapi
```

导出到项目根目录 openapi.json；导出不进入应用 lifespan，不连接数据库。Apifox 选择 OpenAPI 文件导入即可；CI 可使用相同命令生成制品。

## 调试建议

先调用 GET /api/v1/health/live，再调用 GET /api/v1/health/ready。ready 返回 503 时，查看 data 中缺失的依赖项；先配置连接并显式初始化项目表，不要用存活检查代替数据库就绪检查。

创建用户返回 201、重复邮箱返回 409；参数错误返回 422；统一响应均包含 code、message、data、request_id。可以记录 X-Request-ID 排查请求。文档向量接口依赖 Ollama、配置的 embedding 模型和 pgvector 项目表，返回的相似度 score 越大越相似，通常范围 [-1,1]。

这里完成的是 OpenAPI 对接能力与说明，未创建或修改远程 Apifox 项目，也没有配置远程访问 Token。不要将数据库连接串或密钥放入示例请求。
