import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { createDatabase } from './db.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnApplicationShutdown {
  readonly db = createDatabase();

  async onModuleInit(): Promise<void> {
    await this.db.connect();
  }

  async onApplicationShutdown(): Promise<void> {
    await this.db.close();
  }
}
