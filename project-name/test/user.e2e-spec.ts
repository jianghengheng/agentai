import {
  ConflictException,
  NotFoundException,
  type INestApplication,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';
import { PrismaService } from '../src/prisma/prisma.service.js';
import { UserService } from '../src/user/user.service.js';

describe('UserController (e2e)', () => {
  let app: INestApplication<App>;
  const user = {
    id: '8352368a-ec16-4ce2-b21f-e31d9e892821',
    email: 'alice@example.com',
    name: 'Alice',
    createdAt: '2026-10-27T00:00:00Z',
  };
  const users = {
    create: vi.fn(),
    findAll: vi.fn(),
    findOne: vi.fn(),
    update: vi.fn(),
    remove: vi.fn(),
  };

  beforeAll(async () => {
    const fixture = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue({})
      .overrideProvider(UserService)
      .useValue(users)
      .compile();
    app = fixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.resetAllMocks();
    users.create.mockResolvedValue(user);
    users.findAll.mockResolvedValue([user]);
    users.findOne.mockResolvedValue(user);
    users.update.mockResolvedValue(user);
    users.remove.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    await app?.close();
  });

  it('creates a user', async () => {
    await request(app.getHttpServer())
      .post('/user')
      .send({ email: user.email, name: user.name })
      .expect(201)
      .expect({ code: 200, msg: 'success', data: user });
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: user.email, name: user.name }),
    );
  });

  it.each([
    {},
    { email: 'invalid' },
    { email: null },
    { email: user.email, name: 123 },
    { email: user.email, id: user.id },
  ])('rejects an invalid create body: %j', async (body) => {
    const response = await request(app.getHttpServer())
      .post('/user')
      .send(body)
      .expect(400);
    expect(response.body).toEqual({
      code: 400,
      msg: expect.any(String),
      data: null,
    });
    expect(users.create).not.toHaveBeenCalled();
  });

  it('lists users with default pagination', async () => {
    await request(app.getHttpServer())
      .get('/user')
      .expect(200)
      .expect({ code: 200, msg: 'success', data: [user] });
    expect(users.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 20, offset: 0 }),
    );
  });

  it('converts pagination query strings to numbers', async () => {
    await request(app.getHttpServer())
      .get('/user?limit=5&offset=10')
      .expect(200);
    expect(users.findAll).toHaveBeenCalledWith(
      expect.objectContaining({ limit: 5, offset: 10 }),
    );
  });

  it.each(['limit=101', 'limit=abc', 'limit=1.5', 'offset=-1'])(
    'rejects invalid pagination: %s',
    async (query) => {
      await request(app.getHttpServer()).get(`/user?${query}`).expect(400);
      expect(users.findAll).not.toHaveBeenCalled();
    },
  );

  it('fetches a user by id', async () => {
    await request(app.getHttpServer())
      .get(`/user/${user.id}`)
      .expect(200)
      .expect({ code: 200, msg: 'success', data: user });
    expect(users.findOne).toHaveBeenCalledWith(user.id);
  });

  it('rejects malformed user ids', async () => {
    await request(app.getHttpServer()).get('/user/not-a-uuid').expect(400);
    expect(users.findOne).not.toHaveBeenCalled();
  });

  it('returns 404 when a user is missing', async () => {
    users.findOne.mockRejectedValue(new NotFoundException('User not found'));
    await request(app.getHttpServer())
      .get(`/user/${user.id}`)
      .expect(404)
      .expect({ code: 404, msg: 'User not found', data: null });
  });

  it('wraps conflicts and preserves HTTP 409', async () => {
    users.create.mockRejectedValue(
      new ConflictException('Email already exists'),
    );
    await request(app.getHttpServer())
      .post('/user')
      .send({ email: user.email })
      .expect(409)
      .expect({ code: 409, msg: 'Email already exists', data: null });
  });

  it('hides unexpected exception details in the unified 500 response', async () => {
    users.findOne.mockRejectedValue(
      new Error('Private database connection details'),
    );
    await request(app.getHttpServer())
      .get(`/user/${user.id}`)
      .expect(500)
      .expect({ code: 500, msg: 'Internal server error', data: null });
  });

  it('updates a user and allows clearing the optional name', async () => {
    await request(app.getHttpServer())
      .patch(`/user/${user.id}`)
      .send({ name: null })
      .expect(200);
    expect(users.update).toHaveBeenCalledWith(
      user.id,
      expect.objectContaining({ name: null }),
    );
  });

  it.each([
    { email: null },
    { email: 'invalid' },
    { name: 123 },
    { createdAt: '2026-10-27' },
  ])('rejects an invalid update body: %j', async (body) => {
    await request(app.getHttpServer())
      .patch(`/user/${user.id}`)
      .send(body)
      .expect(400);
    expect(users.update).not.toHaveBeenCalled();
  });

  it('deletes a user with a unified response and null data', async () => {
    const response = await request(app.getHttpServer())
      .delete(`/user/${user.id}`)
      .expect(200);
    expect(response.body).toEqual({ code: 200, msg: 'success', data: null });
    expect(users.remove).toHaveBeenCalledWith(user.id);
  });
});
