<p align="center">
  <a href="http://nestjs.com/" target="blank"><img src="https://nestjs.com/img/logo-small.svg" width="120" alt="Nest Logo" /></a>
</p>

[circleci-image]: https://img.shields.io/circleci/build/github/nestjs/nest/master?token=abc123def456
[circleci-url]: https://circleci.com/gh/nestjs/nest

  <p align="center">A progressive <a href="http://nodejs.org" target="_blank">Node.js</a> framework for building efficient and scalable server-side applications.</p>
    <p align="center">
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/v/@nestjs/core.svg" alt="NPM Version" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/l/@nestjs/core.svg" alt="Package License" /></a>
<a href="https://www.npmjs.com/~nestjscore" target="_blank"><img src="https://img.shields.io/npm/dm/@nestjs/common.svg" alt="NPM Downloads" /></a>
<a href="https://circleci.com/gh/nestjs/nest" target="_blank"><img src="https://img.shields.io/circleci/build/github/nestjs/nest/master" alt="CircleCI" /></a>
<a href="https://discord.gg/G7Qnnhy" target="_blank"><img src="https://img.shields.io/badge/discord-online-brightgreen.svg" alt="Discord"/></a>
<a href="https://opencollective.com/nest#backer" target="_blank"><img src="https://opencollective.com/nest/backers/badge.svg" alt="Backers on Open Collective" /></a>
<a href="https://opencollective.com/nest#sponsor" target="_blank"><img src="https://opencollective.com/nest/sponsors/badge.svg" alt="Sponsors on Open Collective" /></a>
  <a href="https://paypal.me/kamilmysliwiec" target="_blank"><img src="https://img.shields.io/badge/Donate-PayPal-ff3f59.svg" alt="Donate us"/></a>
    <a href="https://opencollective.com/nest#sponsor"  target="_blank"><img src="https://img.shields.io/badge/Support%20us-Open%20Collective-41B883.svg" alt="Support us"></a>
  <a href="https://twitter.com/nestframework" target="_blank"><img src="https://img.shields.io/twitter/follow/nestframework.svg?style=social&label=Follow" alt="Follow us on Twitter"></a>
</p>
  <!--[![Backers on Open Collective](https://opencollective.com/nest/backers/badge.svg)](https://opencollective.com/nest#backer)
  [![Sponsors on Open Collective](https://opencollective.com/nest/sponsors/badge.svg)](https://opencollective.com/nest#sponsor)-->

## Description

[Nest](https://github.com/nestjs/nest) framework TypeScript starter repository.

## Project setup

```bash
$ pnpm install
```

## Prisma 8 / PostgreSQL

本项目使用 Prisma 8：CLI 为 `8.0.0-rc.27`，PostgreSQL 运行包为 `8.0.0-rc.20`。
需要 Node.js 22.18+（22 系列）或 24.11+（24 系列）。

首次配置时，将 `.env.example` 复制为 `.env`，填写 `DATABASE_URL`。
连接信息只放在本地 `.env` 或部署环境变量中。

```bash
# 修改 src/prisma/contract.prisma 后生成 JSON 和类型
pnpm run prisma:generate

# 首次建表（只执行新增操作）
pnpm run prisma:db:init

# 检查数据库与 contract 是否一致 / 查看表结构
pnpm run prisma:db:verify
pnpm run prisma:db:schema

# 开发时同步模型变更
pnpm run prisma:db:update

# 需要保留迁移历史时，生成并审查迁移，再应用
pnpm run prisma:migration:plan --name add_profile
pnpm run prisma:migrate
```

`src/prisma/contract.prisma` 是模型定义，`contract.json` 和 `contract.d.ts` 是生成文件，
应随源码保存，不能手动修改。`pnpm run build` 会先重新生成 contract。
`PrismaModule` 已在根模块注册，其他服务可以直接注入 `PrismaService`：

```typescript
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma/prisma.service.js';

@Injectable()
export class ExampleService {
  constructor(private readonly prisma: PrismaService) {}

  async listUsers() {
    return await this.prisma.db.orm.public.User
      .select('id', 'email', 'name', 'createdAt')
      .limit(20)
      .all();
  }
}
```

Prisma 8 使用 `db.orm.public.User`，查询方式与 Prisma 7 不同。
NestJS 启动时创建数据库运行时，关闭应用时释放连接池。
Node.js 22 所需的 Temporal polyfill 已在数据库入口加载。

## Apifox 自动同步

接口定义由 NestJS 的 Controller、DTO 和 Swagger 注解生成。已启用 Swagger CLI 插件，
可从 DTO 类型、校验规则和注释中自动补充字段文档。

```text
修改 Controller / DTO
        ↓ NestJS 重新编译
http://localhost:3000/docs-json
        ↓ Apifox 定时导入
agent 项目的接口和模型更新
```

启动 `pnpm run start:dev` 后，可以访问：

- Swagger 页面：<http://localhost:3000/docs>
- OpenAPI JSON：<http://localhost:3000/docs-json>

当前 6 个接口和 3 个模型已导入 Apifox 的 `agent` 项目（项目 ID：`8974186`）。
自动同步还需要在 Apifox 中完成一次配置：

1. 打开 `agent` → **项目设置** → **导入数据** → **定时导入（绑定数据源）** → **新建**。
2. 数据源格式选择 **OpenAPI/Swagger**，数据源 URL 填 `http://localhost:3000/docs-json`。
3. 运行位置选择 **本地客户端**，目标分支选择 `main`，设置需要的导入频率。
4. 在高级设置中，按 **请求方法 + 路径** 匹配并覆盖更新接口，按 **名称** 匹配更新数据模型。
5. 保存。开发时保持 NestJS 服务运行，并在 Apifox 客户端中打开该项目。

定时导入由本地客户端触发；项目未打开时不会执行。需要持续运行时，可部署自托管 Runner，
并把数据源 URL 改成 Runner 可以访问的服务地址。
详见 [Apifox 官方定时导入说明](https://docs.apifox.com/scheduled-import)。

以后写接口时：Controller 定义路由，DTO 定义请求参数；用 `@ApiOperation` 设置接口中文名称，
用 `@ApiTags` 设置分组。返回 Prisma 查询结果时，用 `@ApiOkResponse` / `@ApiCreatedResponse`
指定响应 DTO，保证 Apifox 获得完整响应结构。现有用户接口是完整示例。

运行/调试页需要实际的请求 JSON，字段上的 `@ApiProperty({ example: ... })`
不会覆盖已有调试用例中保存的空 Body。请求级示例使用 `@ApiBody` 声明：

```typescript
@ApiBody({
  type: CreateUserDto,
  examples: {
    createUser: {
      summary: '新增用户',
      value: { email: 'alice@example.com', name: '张三' },
    },
  },
})
```

同步后可在 Apifox 中引用“新增用户”请求示例。已经保存的调试请求可手动载入该示例并保存。

也可以导出文件用于手动导入或 CI：

```bash
pnpm run openapi:export
# 生成项目根目录 openapi.json
```

部署环境可以设置 `API_BASE_URL`，用于指定文档中的服务地址。

## 统一返回结构

所有业务 JSON 接口统一返回：

```typescript
interface ApiResponse<T> {
  code: number;
  msg: string;
  data: T | null;
}
```

成功时 `code` 为 `200`、`msg` 为 `success`，原来的业务结果放在 `data` 中。
没有结果时返回 `data: null`，列表结果仍是 `data` 中的数组。

```json
{"code":200,"msg":"success","data":{"email":"alice@example.com","name":"张三"}}
```

错误也使用相同结构，HTTP 状态码继续表示错误类型；`code` 等于 HTTP 错误码，
`msg` 是具体错误信息，参数校验的多条错误会合并成一个字符串。

```json
{"code":404,"msg":"User not found","data":null}
```

POST 新增成功仍使用 HTTP 201，响应中的业务 `code` 为 200。
DELETE 成功改为 HTTP 200，并返回 `{"code":200,"msg":"success","data":null}`。
Swagger/OpenAPI 和 Apifox 的响应结构会同步包含 `code`、`msg`、`data`。

业务 Controller 继续直接返回查询结果，由全局拦截器统一包装；异常由全局过滤器统一处理。
Swagger 文档和文件流直接使用各自原始格式。

## 用户接口

| 方法 | 路径 | 用途 | 成功状态 |
| --- | --- | --- | --- |
| POST | `/user` | 新增用户 | 201 |
| GET | `/user?limit=20&offset=0` | 分页查询用户列表 | 200 |
| GET | `/user/:id` | 查询用户详情 | 200 |
| PATCH | `/user/:id` | 修改邮箱或姓名 | 200 |
| DELETE | `/user/:id` | 删除用户 | 200（data 为 null） |

新增时 `email` 必填且不能重复，`name` 可选。修改时至少提供一个字段，
`name: null` 可以清空姓名。邮箱最长 254 字符，姓名最长 100 字符。
`id` 和 `createdAt` 自动生成，接口不接受写入。`id` 使用 UUIDv4。
列表默认按创建时间倒序返回，`limit` 范围为 1–100，`offset` 为非负整数。
参数错误返回 400，用户不存在返回 404，邮箱重复返回 409。

```bash
# 新增用户（响应中的 data.id 用于后续操作）
curl -X POST http://localhost:3000/user \
  -H 'Content-Type: application/json' \
  -d '{"email":"alice@example.com","name":"Alice"}'

# 查询列表
curl 'http://localhost:3000/user?limit=20&offset=0'

# 查询详情
curl http://localhost:3000/user/USER_ID

# 修改用户
curl -X PATCH http://localhost:3000/user/USER_ID \
  -H 'Content-Type: application/json' \
  -d '{"name":"Alice Chen"}'

# 删除用户
curl -X DELETE http://localhost:3000/user/USER_ID
```

## Compile and run the project

```bash
# development
$ pnpm run start

# watch mode
$ pnpm run start:dev

# production mode
$ pnpm run start:prod
```

## Run tests

```bash
# unit tests
$ pnpm run test

# e2e tests
$ pnpm run test:e2e

# test coverage
$ pnpm run test:cov
```

## Deployment

When you're ready to deploy your NestJS application to production, there are some key steps you can take to ensure it runs as efficiently as possible. Check out the [deployment documentation](https://docs.nestjs.com/deployment) for more information.

If you are looking for a cloud-based platform to deploy your NestJS application, check out [Mau](https://mau.nestjs.com), our official platform for deploying NestJS applications on AWS. Mau makes deployment straightforward and fast, requiring just a few simple steps:

```bash
$ pnpm install -g @nestjs/mau
$ mau deploy
```

With Mau, you can deploy your application in just a few clicks, allowing you to focus on building features rather than managing infrastructure.

## Observability

In production applications, observability is essential for understanding how your system behaves, detecting issues early, and maintaining reliable performance.

[NestJS Observe](https://observe.nestjs.com) automatically instruments your NestJS application, giving you deep visibility into your system with minimal setup:

- **Distributed tracing:** Follow requests across services and understand how they flow through your system.
- **Waterfall analysis:** Visualize request execution and identify slow operations, bottlenecks, and unexpected delays.
- **Performance analysis:** Analyze application performance in real time and quickly pinpoint areas that need optimization.
- **Metrics:** Track key application and infrastructure metrics to understand system health and performance trends.
- **Logging:** Centralize and correlate logs with traces and other telemetry to make debugging easier.
- **Error tracking:** Detect errors quickly and investigate their root causes with the surrounding context.
- **SLA monitoring:** Track service-level objectives and identify when your application is approaching or exceeding defined thresholds.
- **Alarms and alerts:** Set up alerts for critical errors, performance degradation, SLA violations, and other anomalies so your team can react quickly.

This project is already instrumented. To connect it, run this and approve the code it prints at [observe.nestjs.com/link](https://observe.nestjs.com/link) - signing up for free if you have no account:

```bash
$ npx @nestjs/observe link
```

It writes the app key and secret into `.env` and makes every `nest start` script (`start`, `start:dev`, `start:debug`) load it. In production, set `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment instead.

Or do it by hand: create an application and an API key at [observe.nestjs.com](https://observe.nestjs.com), and set the pair as `OBSERVE_APP_KEY` and `OBSERVE_APP_SECRET` in the environment the app runs in.

The free plan needs no payment details and covers 300,000 events a month. You can also browse the [live demo](https://www.observe-demo.nestjs.com/dashboard) first - the whole dashboard over a busy service's data, with nothing to install.

## Resources

Check out a few resources that may come in handy when working with NestJS:

- Visit the [NestJS Documentation](https://docs.nestjs.com) to learn more about the framework.
- For questions and support, please visit our [Discord channel](https://discord.gg/G7Qnnhy).
- To dive deeper and get more hands-on experience, check out our official video [courses](https://courses.nestjs.com/).
- Deploy your application to AWS with the help of [NestJS Mau](https://mau.nestjs.com) in just a few clicks.
- Auto-instrument your application with [NestJS Observe](https://observe.nestjs.com). Distributed tracing, metrics, and logging made easy. Error tracking and performance monitoring for your NestJS applications.
- Visualize your application graph and interact with the NestJS application in real-time using [NestJS Devtools](https://devtools.nestjs.com).
- Need help with your project (part-time to full-time)? Check out our official [enterprise support](https://enterprise.nestjs.com).
- To stay in the loop and get updates, follow us on [X](https://x.com/nestframework) and [LinkedIn](https://linkedin.com/company/nestjs).
- Looking for a job, or have a job to offer? Check out our official [Jobs board](https://jobs.nestjs.com).

## Support

Nest is an MIT-licensed open source project. It can grow thanks to the sponsors and support by the amazing backers. If you'd like to join them, please [read more here](https://docs.nestjs.com/support).

## Stay in touch

- Author - [Kamil Myśliwiec](https://twitter.com/kammysliwiec)
- Website - [https://nestjs.com](https://nestjs.com/)
- Twitter - [@nestframework](https://twitter.com/nestframework)

## License

Nest is [MIT licensed](https://github.com/nestjs/nest/blob/master/LICENSE).
