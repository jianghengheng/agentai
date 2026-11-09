import { Test, TestingModule } from '@nestjs/testing';
import { AiService } from './ai/ai.service.js';
import { LanggraphService } from './langgraph/langgraph.service.js';
import { PrismaService } from './prisma/prisma.service.js';

describe('LanggraphService', () => {
  let service: LanggraphService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        LanggraphService,
        {
          provide: AiService,
          useValue: { llm: { invoke: vi.fn() } },
        },
        {
          provide: PrismaService,
          useValue: { checkpointer: {} },
        },
      ],
    }).compile();

    service = module.get<LanggraphService>(LanggraphService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('compiles a graph with the Prisma-managed checkpointer', () => {
    expect(service.createGraph()).toBeDefined();
  });
});
