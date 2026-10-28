import { Test, TestingModule } from '@nestjs/testing';
import { EmbedController } from './embed.controller.js';
import { EmbedService } from './embed.service.js';
import { AiModule } from '../ai/ai.module.js';

describe('EmbedController', () => {
  let controller: EmbedController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AiModule],
      controllers: [EmbedController],
      providers: [EmbedService],
    }).compile();

    controller = module.get<EmbedController>(EmbedController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
