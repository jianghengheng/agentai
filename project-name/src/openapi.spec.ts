import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { AppModule } from './app.module.js';
import { createOpenApiDocument } from './openapi.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('OpenAPI document', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(PrismaService)
      .useValue({})
      .compile();
    app = fixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('discovers all existing HTTP operations for Apifox', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths['/']?.get).toBeDefined();
    expect(document.paths['/user']?.post).toBeDefined();
    expect(document.paths['/user']?.get).toBeDefined();
    expect(document.paths['/user/{id}']?.get).toBeDefined();
    expect(document.paths['/user/{id}']?.patch).toBeDefined();
    expect(
      document.paths['/user/{id}']?.delete?.responses['200'],
    ).toBeDefined();
  });

  it('describes required email, optional name and nullable updates accurately', () => {
    const schemas = createOpenApiDocument(app).components?.schemas;
    expect(schemas?.CreateUserDto).toMatchObject({
      required: ['email'],
      properties: {
        email: { type: 'string', format: 'email', maxLength: 254 },
        name: { type: 'string', nullable: true, maxLength: 100 },
      },
    });
    expect(schemas?.UpdateUserDto).toMatchObject({
      properties: {
        email: { type: 'string', format: 'email' },
        name: { type: 'string', nullable: true },
      },
    });
    expect(schemas?.UpdateUserDto).not.toHaveProperty('required');
  });

  it('includes response models and error statuses', () => {
    const document = createOpenApiDocument(app);
    expect(document.components?.schemas?.UserResponseDto).toMatchObject({
      required: expect.arrayContaining(['id', 'email', 'name', 'createdAt']),
      properties: {
        id: { type: 'string', format: 'uuid' },
        createdAt: { type: 'string', format: 'date-time' },
      },
    });
    expect(document.paths['/user']?.post?.responses).toHaveProperty('409');
    expect(document.paths['/user/{id}']?.patch?.responses).toHaveProperty(
      '404',
    );
    expect(document.paths['/user']?.get?.responses['200']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            type: 'object',
            required: ['code', 'msg', 'data'],
            properties: {
              code: { type: 'integer', example: 200 },
              msg: { type: 'string', example: 'success' },
              data: {
                type: 'array',
                items: { $ref: '#/components/schemas/UserResponseDto' },
              },
            },
          },
        },
      },
    });
  });

  it('documents the same envelope for errors and empty results', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths['/user']?.post?.responses['400']).toMatchObject({
      content: {
        'application/json': {
          schema: {
            required: ['code', 'msg', 'data'],
            properties: {
              code: { example: 400 },
              msg: { type: 'string' },
              data: { nullable: true, example: null },
            },
          },
        },
      },
    });
    expect(
      document.paths['/user/{id}']?.delete?.responses['200'],
    ).toMatchObject({
      content: {
        'application/json': {
          schema: {
            properties: { data: { nullable: true, example: null } },
          },
        },
      },
    });
  });

  it('exports a complete POST body example for Apifox debugging', () => {
    const document = createOpenApiDocument(app);
    expect(document.paths['/user']?.post?.requestBody).toMatchObject({
      required: true,
      content: {
        'application/json': {
          examples: {
            createUser: {
              value: { email: 'alice@example.com', name: '张三' },
            },
          },
        },
      },
    });
  });
});
