import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from './user.service.js';

describe('UserService', () => {
  const missingId = '8352368a-ec16-4ce2-b21f-e31d9e892821';
  let service: UserService;
  let users: {
    create: ReturnType<typeof vi.fn>;
    first: ReturnType<typeof vi.fn>;
    where: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    users = {
      create: vi.fn(),
      first: vi.fn(),
      where: vi.fn().mockReturnThis(),
      update: vi.fn(),
      delete: vi.fn(),
    };
    const prisma = {
      db: { orm: { public: { User: users } } },
    } as unknown as PrismaService;
    service = new UserService(prisma);
  });

  it('returns 404 when the requested user does not exist', async () => {
    users.first.mockResolvedValue(null);
    await expect(service.findOne(missingId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 404 when an update matches no user', async () => {
    users.update.mockResolvedValue(null);
    await expect(
      service.update(missingId, { name: 'Alice' }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it('returns 404 when deleting a missing user', async () => {
    users.delete.mockResolvedValue(null);
    await expect(service.remove(missingId)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it('returns 409 for a PostgreSQL email uniqueness violation on create', async () => {
    users.create.mockRejectedValue({ sqlState: '23505' });
    await expect(
      service.create({ email: 'alice@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('returns 409 for a wrapped uniqueness violation on update', async () => {
    users.update.mockRejectedValue(
      new Error('Write failed', { cause: { sqlState: '23505' } }),
    );
    await expect(
      service.update(missingId, { email: 'alice@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('reads sqlState from Prisma SqlQueryError before its pg cause', async () => {
    const failure = Object.assign(
      new Error('Query failed', { cause: { code: '23505' } }),
      { name: 'SqlQueryError', sqlState: '23505' },
    );
    users.create.mockRejectedValue(failure);
    await expect(
      service.create({ email: 'alice@example.com' }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('preserves unexpected database failures', async () => {
    const failure = new Error('Database unavailable');
    users.create.mockRejectedValue(failure);
    await expect(service.create({ email: 'alice@example.com' })).rejects.toBe(
      failure,
    );
  });

  it('rejects empty updates before accessing the database', async () => {
    await expect(service.update(missingId, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(users.where).not.toHaveBeenCalled();
  });
});
