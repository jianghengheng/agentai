import { Module } from '@nestjs/common';
import { AiModule } from '../ai/ai.module.js';
import { PrismaModule } from '../prisma/prisma.module.js';
import { LanggraphController } from './langgraph.controller.js';
import { LanggraphService } from './langgraph.service.js';

@Module({
  imports: [AiModule, PrismaModule],
  controllers: [LanggraphController],
  providers: [LanggraphService],
  exports: [LanggraphService],
})
export class LanggraphModule {}
