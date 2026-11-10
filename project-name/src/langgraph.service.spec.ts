import { Test, TestingModule } from '@nestjs/testing';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import { MemorySaver } from '@langchain/langgraph';
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

  it('returns all chat messages for a thread without invoking the model', async () => {
    const messages = [
      { type: 'human', content: '你好' },
      { type: 'ai', content: '你好，有什么可以帮助你？' },
    ];
    const getState = vi.fn().mockResolvedValue({
      values: { messages },
    });
    vi.spyOn(service, 'createGraph').mockReturnValue({ getState } as never);

    const result = await service.getModelHistory('thread-1');

    expect(result).toEqual(messages);
    expect(getState).toHaveBeenCalledWith({
      configurable: { thread_id: 'thread-1' },
    });
  });

  it('returns an empty list when a thread has no messages', async () => {
    const getState = vi.fn().mockResolvedValue({ values: {} });
    vi.spyOn(service, 'createGraph').mockReturnValue({ getState } as never);

    await expect(service.getModelHistory('missing-thread')).resolves.toEqual([]);
  });

  it('resumes the checkpoint using the returned thread ID and isolates other threads', async () => {
    const checkpointer = new MemorySaver();
    const invoke = vi.fn().mockResolvedValue(new AIMessage('请提供新邮箱'));
    const modService = new LanggraphService(
      { llm: { bindTools: vi.fn().mockReturnValue({ invoke }) } } as unknown as AiService,
      { checkpointer } as unknown as PrismaService,
    );

    const first = await modService.getMod('帮我修改蒋衡的邮箱');
    const saved = await checkpointer.getTuple({ configurable: { thread_id: first.threadId } });
    expect(saved?.checkpoint.channel_values.messages).toEqual(first.content.messages);

    await modService.getMod('1301950289@11.com', first.threadId);
    const secondInput = invoke.mock.calls[1][0] as BaseMessage[];
    expect(secondInput.map((message) => message.content)).toContain('帮我修改蒋衡的邮箱');
    expect(secondInput.map((message) => message.content)).toContain('请提供新邮箱');
    expect(secondInput.at(-1)?.content).toBe('1301950289@11.com');

    await modService.getMod('独立会话', 'another-thread');
    const otherInput = invoke.mock.calls[2][0] as BaseMessage[];
    expect(otherInput.map((message) => message.content)).not.toContain('帮我修改蒋衡的邮箱');
  });

  it('sends the current user message to the model only once', async () => {
    const invoke = vi.fn().mockResolvedValue(new AIMessage('done'));
    const modService = new LanggraphService(
      { llm: { bindTools: vi.fn().mockReturnValue({ invoke }) } } as unknown as AiService,
      { checkpointer: new MemorySaver() } as unknown as PrismaService,
    );

    await modService.getMod('1301950289@11.com', 'thread-1');

    const input = invoke.mock.calls[0][0] as BaseMessage[];
    expect(input.filter((message) => message.content === '1301950289@11.com')).toHaveLength(1);
  });

  it('passes each split task to the subtask processor', async () => {
    const invoke = vi
      .fn()
      .mockResolvedValueOnce(new AIMessage('子任务 A\n子任务 B'))
      .mockResolvedValueOnce(new AIMessage('结果 A'))
      .mockResolvedValueOnce(new AIMessage('结果 B'))
      .mockResolvedValueOnce(new AIMessage('最终报告'));

    const parallelService = new LanggraphService(
      { llm: { invoke } } as unknown as AiService,
      { checkpointer: new MemorySaver() } as unknown as PrismaService,
    );

    const result = await parallelService.runLanggraphParallel('为前端全栈开发者设计学习路线');

    expect(result.results).toHaveLength(2);
    expect(result.results).toEqual([
      { task: '子任务 A', result: '结果 A' },
      { task: '子任务 B', result: '结果 B' },
    ]);
    expect(invoke.mock.calls[1][0][0].content).toContain('子任务 A');
    expect(invoke.mock.calls[1][0][0].content).not.toContain('undefined');
    expect(invoke.mock.calls[2][0][0].content).toContain('子任务 B');
    expect(invoke.mock.calls[2][0][0].content).not.toContain('undefined');
    expect(invoke.mock.calls[3][0][0].content).toContain('子任务：子任务 A');
    expect(invoke.mock.calls[3][0][0].content).toContain('结果：结果 A');
    expect(invoke.mock.calls[3][0][0].content).toContain('子任务：子任务 B');
    expect(invoke.mock.calls[3][0][0].content).toContain('结果：结果 B');
    expect(result.finalReport).toBe('最终报告');
  });

  it('finishes the supervisor graph when the model returns FINISH', async () => {
    const invoke = vi.fn().mockResolvedValue(new AIMessage('FINISH'));
    const supervisorService = new LanggraphService(
      { llm: { invoke } } as unknown as AiService,
      {} as PrismaService,
    );

    await expect(supervisorService.supervisor('你好')).resolves.toEqual({
      agentLog: ['[Supervisor] 下一步 → FINISH'],
      completedAgents: [],
      finalReport: '[Supervisor] 下一步 → FINISH',
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it.each(['researcher', 'analyst', 'writer', 'coding'])(
    'routes the supervisor to %s and preserves worker context and results',
    async (agentName) => {
      const invoke = vi.fn()
        .mockResolvedValueOnce(new AIMessage(agentName))
        .mockResolvedValueOnce(new AIMessage('工作结果'))
        .mockResolvedValueOnce(new AIMessage('FINISH'));
      const supervisorService = new LanggraphService(
        { llm: { invoke } } as unknown as AiService,
        {} as PrismaService,
      );

      const result = await supervisorService.supervisor('完成任务');

      expect(invoke).toHaveBeenCalledTimes(3);
      expect(result.completedAgents).toEqual([agentName]);
      expect(result.agentLog).toEqual([
        `[Supervisor] 下一步 → ${agentName}`,
        `[${agentName}] 工作结果`,
        '[Supervisor] 下一步 → FINISH',
      ]);
      const workerInput = invoke.mock.calls[1][0] as BaseMessage[];
      expect(workerInput[1].content).toContain('原始任务：完成任务');
      expect(workerInput[1].content).toContain(`[Supervisor] 下一步 → ${agentName}`);
      const supervisorInput = invoke.mock.calls[2][0] as BaseMessage[];
      expect(supervisorInput[0].content).toContain(`已完成：${agentName}`);
      expect(supervisorInput.map((message) => message.content)).toContain(`[${agentName}] 工作结果`);
      if (agentName === 'writer') expect(result.finalReport).toBe('工作结果');
    },
  );

  it('falls back to FINISH for an unknown supervisor destination', async () => {
    const invoke = vi.fn().mockResolvedValue(new AIMessage('unknown-agent'));
    const supervisorService = new LanggraphService(
      { llm: { invoke } } as unknown as AiService,
      {} as PrismaService,
    );

    await expect(supervisorService.supervisor('完成任务')).resolves.toMatchObject({
      completedAgents: [],
      agentLog: ['[Supervisor] 下一步 → FINISH'],
    });
    expect(invoke).toHaveBeenCalledTimes(1);
  });

  it('ends when the model does not request a tool', async () => {
    const invoke = vi.fn().mockResolvedValue(new AIMessage('done'));
    const bindTools = vi.fn().mockReturnValue({ invoke });

    (service as unknown as { ai: { llm: unknown } }).ai.llm = {
      invoke,
      bindTools,
    };
    (service as unknown as { prisma: { checkpointer: false } }).prisma.checkpointer = false;

    await expect(service.getMod('hello', 'thread-1')).resolves.toMatchObject({
      threadId: 'thread-1',
      content: {
        messages: expect.arrayContaining([
          expect.objectContaining({ content: 'done' }),
        ]),
      },
    });
  });
});
