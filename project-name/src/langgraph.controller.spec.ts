import { ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import { Test, TestingModule } from '@nestjs/testing';
import { LanggraphController } from './langgraph/langgraph.controller.js';
import { LanggraphService } from './langgraph/langgraph.service.js';

describe('LanggraphController', () => {
  let controller: LanggraphController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [LanggraphController],
      providers: [
        { provide: LanggraphService, useValue: { getModelHistory: vi.fn() } },
      ],
    }).compile();

    controller = module.get<LanggraphController>(LanggraphController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('reads threadId from the history query string', () => {
    const args = Reflect.getMetadata(
      ROUTE_ARGS_METADATA,
      LanggraphController,
      'getModelHistory',
    );

    expect(args?.[`${RouteParamtypes.QUERY}:0`]).toMatchObject({
      index: 0,
      data: 'threadId',
    });
  });
});
