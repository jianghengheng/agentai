import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { HumanMessage } from '@langchain/core/messages';
import {
  END,
  MessagesAnnotation,
  START,
  StateGraph,
} from '@langchain/langgraph';
import { AiService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class LanggraphService {
  constructor(
    private readonly ai: AiService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  createGraph() {
    const callModel = async (state: typeof MessagesAnnotation.State) => {
      const response = await this.ai.llm.invoke(state.messages);
      return { messages: [response] };
    };

    return new StateGraph(MessagesAnnotation)
      .addNode('call_model', callModel)
      .addEdge(START, 'call_model')
      .addEdge('call_model', END)
      .compile({
        checkpointer: this.prisma.checkpointer,
        store: this.prisma.store,
      });
  }

  async runLanggraph(message: string, threadId?: string) {
    const currentThreadId = threadId ?? randomUUID();
    const state = await this.createGraph().invoke(
      { messages: [new HumanMessage(message)] },
      { configurable: { thread_id: currentThreadId } },
    );

    return {
      threadId: currentThreadId,
      state,
    };
  }
}
