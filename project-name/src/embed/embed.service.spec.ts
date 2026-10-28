import { Test, TestingModule } from '@nestjs/testing';
import { EmbedService } from './embed.service.js';
import { AiModule } from '../ai/ai.module.js';

describe('EmbedService', () => {
  let service: EmbedService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AiModule],
      providers: [EmbedService],
    }).compile();

    service = module.get<EmbedService>(EmbedService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
