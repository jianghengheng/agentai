import { Injectable } from '@nestjs/common';
import type { OnApplicationShutdown, OnModuleInit } from '@nestjs/common';
import { createCheckpointer, createDatabase, createStore } from './db.js';

@Injectable()
export class PrismaService implements OnModuleInit, OnApplicationShutdown {
  readonly db = createDatabase();
  readonly checkpointer = createCheckpointer();
  readonly store = createStore();

  async onModuleInit(): Promise<void> {
    try {
      await this.db.connect();
      await this.checkpointer.setup();
      await this.store.setup();
    } catch (error) {
      await Promise.allSettled([
        this.checkpointer.end(),
        this.store.stop(),
        this.db.close(),
      ]);
      throw error;
    }
  }

  async onApplicationShutdown(): Promise<void> {
    await Promise.all([
      this.checkpointer.end(),
      this.store.stop(),
      this.db.close(),
    ]);
  }
}
