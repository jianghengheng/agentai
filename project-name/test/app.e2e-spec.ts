import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { RagService } from './../src/rag/rag.service.js';
import { setupOpenApi } from './../src/openapi.js';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(RagService)
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    setupOpenApi(app);
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect({ code: 200, msg: 'success', data: 'Hello World!' });
  });

  it('wraps unknown-route errors and preserves HTTP 404', async () => {
    const response = await request(app.getHttpServer())
      .get('/route-that-does-not-exist')
      .expect(404);
    expect(response.body).toEqual({
      code: 404,
      msg: expect.any(String),
      data: null,
    });
  });

  it('serves the OpenAPI document and Swagger page', async () => {
    const document = await request(app.getHttpServer())
      .get('/docs-json')
      .expect(200);
    expect(document.body.openapi).toBe('3.0.0');
    expect(document.body.paths['/user'].post).toBeDefined();
    expect(document.body.components.schemas.UserResponseDto).toBeDefined();

    const page = await request(app.getHttpServer()).get('/docs').expect(200);
    expect(page.text).toContain('swagger-ui');
  });

  afterEach(async () => {
    await app.close();
  });
});
