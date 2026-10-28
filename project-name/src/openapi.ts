import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { wrapOpenApiResponses } from './common/response.openapi.js';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('Agent API')
    .setDescription('Agent 服务接口，供 Apifox 自动导入和调试。')
    .setVersion('1.0.0')
    .addServer(
      process.env.API_BASE_URL ??
        `http://localhost:${process.env.PORT ?? 3000}`,
      'API 服务地址',
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  wrapOpenApiResponses(document);
  return document;
}

export function setupOpenApi(app: INestApplication) {
  const document = createOpenApiDocument(app);

  SwaggerModule.setup('docs', app, document, {
    jsonDocumentUrl: '/docs-json',
    swaggerOptions: { persistAuthorization: true },
  });

  return document;
}
