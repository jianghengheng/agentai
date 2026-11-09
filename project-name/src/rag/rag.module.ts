import { Module } from '@nestjs/common';
import { PrismaModule } from '../prisma/prisma.module.js';
import { RagController } from './rag.controller.js';
import { RagService } from './rag.service.js';

@Module({
  imports: [PrismaModule],
  controllers: [RagController],
  providers: [RagService],
  exports: [RagService],
})
export class RagModule {}
