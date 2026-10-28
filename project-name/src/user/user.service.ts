import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import type { Models } from '../prisma/contract.d.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateUserDto } from './dto/create-user.dto.js';
import type { ListUsersQueryDto } from './dto/list-users-query.dto.js';
import type { UpdateUserDto } from './dto/update-user.dto.js';

type User = Models.public_User;

@Injectable()
export class UserService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async create(dto: CreateUserDto): Promise<User> {
    try {
      return await this.prisma.db.orm.public.User.create({
        email: dto.email,
        name: dto.name ?? null,
      });
    } catch (error) {
      this.throwWriteError(error);
    }
  }

  async findAll({ limit, offset }: ListUsersQueryDto): Promise<User[]> {
    return await this.prisma.db.orm.public.User.orderBy([
      (user) => user.createdAt.desc(),
      (user) => user.id.desc(),
    ])
      .limit(limit)
      .offset(offset)
      .all();
  }

  async findOne(id: string): Promise<User> {
    const user = await this.prisma.db.orm.public.User.first({ id });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return user;
  }

  async update(id: string, dto: UpdateUserDto): Promise<User> {
    if (dto.email === undefined && dto.name === undefined) {
      throw new BadRequestException('Provide email or name to update');
    }

    const changes = {
      ...(dto.email !== undefined ? { email: dto.email } : {}),
      ...(dto.name !== undefined ? { name: dto.name } : {}),
    };

    try {
      const user = await this.prisma.db.orm.public.User.where({ id }).update(
        changes,
      );

      if (!user) {
        throw new NotFoundException('User not found');
      }

      return user;
    } catch (error) {
      this.throwWriteError(error);
    }
  }

  async remove(id: string): Promise<void> {
    const user = await this.prisma.db.orm.public.User.where({ id }).delete();

    if (!user) {
      throw new NotFoundException('User not found');
    }
  }

  private throwWriteError(error: unknown): never {
    const sources = [error, error instanceof Error ? error.cause : undefined];

    if (
      sources.some(
        (source) =>
          typeof source === 'object' &&
          source !== null &&
          'sqlState' in source &&
          source.sqlState === '23505',
      )
    ) {
      throw new ConflictException('Email already exists');
    }

    throw error;
  }
}
