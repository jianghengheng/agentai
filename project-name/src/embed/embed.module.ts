import { Module } from '@nestjs/common';
import { EmbedController } from './embed.controller.js';
import { EmbedService } from './embed.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
  imports: [PrismaModule],
  controllers: [EmbedController],
  providers: [EmbedService]
})
export class EmbedModule {}
