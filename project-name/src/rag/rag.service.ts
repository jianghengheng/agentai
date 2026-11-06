import 'dotenv/config';
import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
  type OnApplicationShutdown,
  type OnModuleInit,
} from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';
import { PGVectorStore } from '@langchain/pgvector';
import { AddDocumentsDto, QueryDto, SearchDto } from './dto/rag.dto.js';
import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters'
import { Document } from '@langchain/core/documents'
import { Response } from 'express'
import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts'
import { StringOutputParser } from '@langchain/core/output_parsers';
import { RunnablePassthrough, RunnableSequence } from '@langchain/core/runnables';
import { tool, type StructuredToolInterface } from '@langchain/core/tools'
import { z } from 'zod'
import { PrismaService } from '../prisma/prisma.service.js';
import { ToolMessage } from '@langchain/core/messages/tool';
import { AIMessage, HumanMessage, type BaseMessage } from '@langchain/core/messages';

/** 工具名只在这里定义，工具定义、toolMap、system prompt 都引用它，避免名字对不上。 */
const CHECK_USER_TOOL_NAME = 'checkUser';
const CREATE_USER_TOOL_NAME = 'createUser';

/** 写操作工具：不直接执行，先挂起、等用户确认后再执行 */
const WRITE_TOOL_NAMES = new Set<string>([CREATE_USER_TOOL_NAME]);
/** 待确认动作的有效期：超过 5 分钟视为放弃 */
const CONFIRMATION_TTL_MS = 5 * 60 * 1000;

type PendingToolCall = { id: string; name: string; args: Record<string, unknown> };
type PendingAction = {
  sessionId: string;
  message: string;
  calls: PendingToolCall[];
  createdAt: number;
};

@Injectable()
export class RagService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RagService.name);
  /** 按会话保存"等待用户确认"的写操作 */
  private pendingConfirmations?: Map<string, PendingAction>;

  /** 懒初始化：单测里用 Object.create(RagService.prototype) 构造实例时，字段初始化器不会执行 */
  private get pendingActions(): Map<string, PendingAction> {
    this.pendingConfirmations ??= new Map<string, PendingAction>();
    return this.pendingConfirmations;
  }
  private static readonly AFFIRMATIVE_REPLIES = new Set([
    '确认', '确认执行', '确认创建', '确定', '确定执行', '是', '是的', '好', '好的', '可以', '行', '同意',
    '执行', '执行吧', '继续', '创建吧', '没错', '对', '嗯', 'ok', 'okay', 'yes', 'y',
  ]);
  private static readonly NEGATIVE_REPLIES = new Set([
    '取消', '取消创建', '不用', '不用了', '先不用', '算了', '不要', '不要创建', '不创建', '否', '不', 'no',
    'n', 'cancel', '停止', '放弃',
  ]);
  // The existing TEXT id column has no default: pass ids when adding documents.
  readonly vectorStore: PGVectorStore;

  constructor(private readonly ai: AiService, @Inject(PrismaService) private readonly prisma: PrismaService) {
    const connectionString = process.env.RAG_DATABASE_URL;
    this.logger.log(`RagService.name: RAG_DATABASE_URL=${RagService.name}`);
    if (!connectionString?.trim()) {
      throw new Error('RAG_DATABASE_URL is required. Configure it in .env.');
    }

    this.vectorStore = new PGVectorStore(this.ai.embeddings, {
      postgresConnectionOptions: {
        connectionString,
        connectionTimeoutMillis: 5000,
      },
      schemaName: 'public',
      tableName: 'langchain_pg_embedding',
      collectionTableName: 'langchain_pg_collection',
      collectionName: 'default',
      columns: {
        idColumnName: 'id',
        vectorColumnName: 'embedding',
        contentColumnName: 'document',
        metadataColumnName: 'cmetadata',

      },
      distanceStrategy: 'cosine',
      // Tables, extensions, and indexes are provisioned by the existing SQL.
      skipInitializationCheck: true,
    });

    this.vectorStore.pool.on('error', (error: Error) => {
      this.logger.error('RAG database connection error', error.stack);
    });
  }
  private checkUserTool = tool(
    // 第一个参数：执行函数
    async ({ userName }: { userName: string }) => {
      const results = await this.prisma.db.orm.public.User.where({ name: userName }).all();
      if (results.length > 0) {
        return `User "${userName}" is available in the database.results: ${JSON.stringify(results)}`;
      } else {
        return `User "${userName}" is not found in the database.`;
      }
    },
    // 第二个参数：配置对象
    {
      name: CHECK_USER_TOOL_NAME,
      description: "检查当前用户是否在数据库中存在 当用户询问'xxx是否在职','xxx离职了么' ",
      schema: z.object({
        userName: z.string().describe("The name of the user to check"),
      }),
    }
  );


  private createUserTool = tool(
    async ({ userName, email }: { userName: string; email: string }) => {
      const existingUser = await this.prisma.db.orm.public.User.where({ name: userName }).first();
      if (existingUser) {
        return `User "${userName}" already exists in the database.`;
      }
      const newUser = await this.prisma.db.orm.public.User.create({
        name: userName,
        email: email,
      });
      return `User "${userName}" has been created successfully with ID: ${newUser.id}.`;
    },
    {
      name: CREATE_USER_TOOL_NAME,
      description: "创建新用户 当用户询问'帮我创建一个新员工xxx' ",
      schema: z.object({
        userName: z.string().describe("The name of the new user to create"),
        email: z.string().email().describe("The email of the new user"),
      }),
    }
  );
  async onModuleInit(): Promise<void> {
    try {
      await this.vectorStore.pool.query('SELECT 1');
      this.logger.log('RAG database connected');
    } catch (error) {
      await this.onApplicationShutdown();
      throw error;
    }
  }
  async onApplicationShutdown(): Promise<void> {
    if (!this.vectorStore.pool.ended) {
      await this.vectorStore.end();
    }
  }
  async addDocuments(dto: AddDocumentsDto, topK: number = 5) {
    const sourceIds = dto.documents.map((doc) => doc.id);
    if (new Set(sourceIds).size !== sourceIds.length) {
      throw new BadRequestException('documents must have unique ids within a request');
    }
    const chunkSize = dto.chunkSize ?? 500;
    const chunkOverlap = dto.chunkOverlap ?? 50;
    const splitter = new RecursiveCharacterTextSplitter({
      chunkSize,
      chunkOverlap,
      separators: ['\n\n', '\n', ' 。', '，', ' ', '', '!'],
    });
    const allDocs: Document[] = []
    const allIds: string[] = []
    for (const doc of dto.documents) {
      const chunks = await splitter.createDocuments(
        [doc.content],
        [{ ...doc.metadata, sourceId: doc.id }],
      )
      chunks.forEach((chunk, i) => {
        chunk.metadata.chunkIndex = i
        chunk.metadata.totalChunks = chunks.length
        allDocs.push(chunk)
        // ✅ id 必须是非空字符串，格式自定义即可
        allIds.push(`${doc.id}-chunk-${i}`)
      })
      this.logger.log(`[PGVector] 文档 ${doc.id} 分块完成：共 ${chunks.length} 块`)
    }
    await this.upsertDocumentChunks(allDocs, allIds, sourceIds);
    this.logger.log(`[PGVector] 文档写入完成：共 ${allDocs.length} 块`);

    return {
      success: true,
      backend: 'pgvector',
      collectionName: dto.collectionName,
      originalDocCount: dto.documents.length,
      totalChunks: allDocs.length,
      chunkSize,
      chunkOverlap,
    };
  }

  private async upsertDocumentChunks(documents: Document[], ids: string[], sourceIds: string[]): Promise<void> {
    if (sourceIds.length === 0) return;
    // Generate embeddings before changing stored data so model failures leave it intact.
    const vectors = documents.length > 0
      ? await this.ai.embeddings.embedDocuments(documents.map((doc) => doc.pageContent))
      : [];
    const collectionId = await this.vectorStore.getOrCreateCollection();
    const table = this.vectorStore.computedTableName;
    const client = await this.vectorStore.pool.connect();
    try {
      await client.query('BEGIN');
      // Lock source ids in a stable order to serialize concurrent replacements.
      for (const sourceId of [...sourceIds].sort()) {
        await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
          `rag:${collectionId}:${sourceId}`,
        ]);
      }
      for (let offset = 0; offset < documents.length; offset += 500) {
        const values: unknown[] = [];
        const placeholders = documents.slice(offset, offset + 500).map((doc, index) => {
          const position = offset + index;
          values.push(
            doc.pageContent.replace(/\0/g, ''),
            `[${vectors[position].join(',')}]`,
            doc.metadata,
            collectionId,
            ids[position],
          );
          const start = index * 5;
          return `($${start + 1}, $${start + 2}, $${start + 3}, $${start + 4}, $${start + 5})`;
        });
        await client.query(`
          INSERT INTO ${table} ("document", "embedding", "cmetadata", "collection_id", "id")
          VALUES ${placeholders.join(', ')}
          ON CONFLICT ("id") DO UPDATE SET
            "document" = EXCLUDED."document",
            "embedding" = EXCLUDED."embedding",
            "cmetadata" = EXCLUDED."cmetadata",
            "collection_id" = EXCLUDED."collection_id"
        `, values);
      }
      await client.query(`
        DELETE FROM ${table}
        WHERE "collection_id" = $1
          AND "cmetadata"->>'sourceId' = ANY($2::text[])
          AND NOT ("id" = ANY($3::text[]))
      `, [collectionId, sourceIds, ids]);
      await client.query('COMMIT');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async search(dto: SearchDto) {
    if (typeof dto?.query !== 'string' || !dto.query.trim()) {
      throw new BadRequestException('query must be a non-empty string');
    }

    const results = await this.vectorStore.similaritySearchWithScore(dto.query, dto.topK ?? 5);
    this.logger.log(`[PGVector] 查询完成：共 ${results.length} 条结果`)
    return {
      success: true,
      backend: 'pgvector',
      collectionName: dto.collectionName,
      query: dto.query,
      topK: dto.topK ?? 5,
      results,
    };
  }
  async query(dto: QueryDto, res: Response) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();
    if (typeof dto?.question !== 'string' || !dto.question.trim()) {
      throw new BadRequestException('question must be a non-empty string');
    }
    if (!this.ai.llm) {
      throw new ServiceUnavailableException('LLM is not initialized');
    }
    const results = await this.vectorStore.similaritySearch(dto.question, dto.topK ?? 5);
    const context = results.map((doc) => doc.pageContent).join('\n\n');
    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(
        `你是专业的知识库问答助手。严格根据参考资料回答问题，无相关内容时直接回答"知识库中暂无相关内容"，不要编造。
参考资料:\n\n{context}\n\n`,
      ),
      HumanMessagePromptTemplate.fromTemplate('{question}'),
    ]);
    const promptValue = await prompt.invoke({
      context,
      question: dto.question,
    });
    const response = await this.ai.llm.stream(promptValue);
    for await (const chunk of response) {
      this.logger.log(`[PGVector] LLM 输出 chunk: ${JSON.stringify(chunk)}`);
      res.write(`data: ${chunk}\n\n`);
    }
    res.write('data: [DONE]\n\n');
    res.end();
    return {
      success: true,
      backend: 'pgvector',
      collectionName: dto.collectionName,
      question: dto.question,
      topK: dto.topK ?? 5,
      answer: response.cancel,

    };
  }

  async translate(message: string, targetLanguage: string = 'en') {
    if (typeof message !== 'string' || !message.trim()) {
      throw new BadRequestException('message must be a non-empty string');
    }
    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(
        `你是专业的翻译助手。将输入内容翻译为指定语言，保留原文格式和标点符号。
目标语言: {targetLanguage}\n\n`,
      ),
      HumanMessagePromptTemplate.fromTemplate('{message}'),
    ]);
    // const promptValue = await prompt.invoke({
    //   message,
    //   targetLanguage,
    // });
    const chian = prompt.pipe(this.ai.llm).pipe(new StringOutputParser())
    const response = await chian.invoke({
      message,
      targetLanguage,
    });
    return {
      targetLanguage,
      originalMessage: message,
      translatedMessage: response,
    };



  }

  //链式调用
  async chain(article: string,) {
    const prompt1 = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate('你是一个专业的文章分析助手。请根据文章内容进行分析，提供详细的见解和总结。'),
      HumanMessagePromptTemplate.fromTemplate('{article}'),

    ])
    const prompt2 = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate('你是一个专业的润色助手。请根据文章内容进行润色，提升语言表达和逻辑结构。'),
      HumanMessagePromptTemplate.fromTemplate('{article}'),

    ])
    const response1 = await prompt1.pipe(this.ai.llm).pipe(new StringOutputParser())
    const response2 = await prompt2.pipe(this.ai.llm).pipe(new StringOutputParser())
    const fullChain = RunnableSequence.from([
      {
        article: new RunnablePassthrough(), // 原文直接透传
        issues: response1,               // 分析链得到问题列表
      },
      response2.pipe(this.ai.llm).pipe(new StringOutputParser()), // 润色链得到润色后的文章
    ])
    const response = await fullChain.invoke({
      article,
    })
    return {
      originalArticle: article,
      analyzedAndPolishedArticle: response,
    }

  }
  async chainmore(article: string) {
    const prompt1 = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate('你是专业博客作者，只输出大纲，不要正文。请根据文章内容进行分析，提供详细的见解和总结。'),
      HumanMessagePromptTemplate.fromTemplate('{article}'),

    ])
    const prompt2 = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate('你是专业博客作者，按照大纲写完整文章。'),
      HumanMessagePromptTemplate.fromTemplate('{outline}'),

    ])
    const prompt4 = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate('你是一个专业的润色助手。请根据文章内容进行润色，提升语言表达和逻辑结构。'),
      HumanMessagePromptTemplate.fromTemplate('{keywords}'),

    ])

    const outline = await prompt1.invoke({ article })
    const keywords = await prompt2.invoke({ outline })
    const titles = await prompt4.invoke({ keywords })
    return { article, outline, keywords, seoTitles: titles }
  }
  async runagent(message: string, sessionId: string = 'default') {
    if (typeof message !== 'string' || !message.trim()) {
      throw new BadRequestException('message must be a non-empty string');
    }
    const session = (sessionId?.trim() || 'default').slice(0, 128);

    const agentTools = [this.checkUserTool, this.createUserTool];
    // 用工具的真实名字做 key，避免 prompt 里写 check_user、模型回 checkUser 时查不到工具
    // 用统一的 StructuredToolInterface 类型，多个工具时 toolFn 才可调用（联合类型的方法签名不可调用）
    const toolMap: Record<string, StructuredToolInterface> = {
      [CHECK_USER_TOOL_NAME]: this.checkUserTool,
      [CREATE_USER_TOOL_NAME]: this.createUserTool,
    };
    // ⚠️ 关键：不要传 { stop: [...] }。OpenAI 兼容网关会把 stop 作用到整个响应体，
    // 工具调用的 JSON 参数生成到一半就被截断，LangChain 解析失败，
    // response.tool_calls 就是空数组，Agent 会误判成“模型已给出最终答案”。
    // 之前的 { stop: ['\n\n'] } 正是 tool_calls 恒为空的根因。
    const llmWithTools = this.ai.llm.bindTools(agentTools, { tool_choice: 'auto' });
    const toolList = agentTools
      .map((agentTool) => `- ${agentTool.name}: ${agentTool.description ?? ''}`)
      .join('\n');
    const prompt = ChatPromptTemplate.fromMessages([
      SystemMessagePromptTemplate.fromTemplate(
        `你是公司的行政助手，可以使用以下工具：
${toolList}

工作原则:
1. 需要真实信息时先调用工具，再根据工具结果回答
2. 调用工具时参数必须准确（人名使用用户提供的原始写法）
3. 没有合适的工具时直接回答，不要编造
4. 回答简洁友好，使用中文`,
      ),
      HumanMessagePromptTemplate.fromTemplate('{message}'),
    ]);
    const steps: string[] = [];
    let roundCount = 0;
    let answer = '';
    let messages: BaseMessage[];

    // 上一轮挂起的写操作：用户这一轮回复「确认 / 取消」
    const pending = this.takePendingAction(session);
    if (pending && RagService.isAffirmative(message)) {
      const describe = pending.calls.map((call) => RagService.describeToolCall(call)).join('；');
      steps.push(`✅ [用户已确认] ${describe}`);
      // 复原当时的上下文：assistant 的 tool_calls 必须和 tool 消息的 tool_call_id 对得上
      messages = await prompt.formatMessages({ message: pending.message });
      messages.push(
        new AIMessage({
          content: '',
          tool_calls: pending.calls.map((call) => ({
            name: call.name,
            args: call.args,
            id: call.id,
          })),
        }),
      );
      for (const call of pending.calls) {
        const result = await this.executeToolCall(toolMap, call);
        steps.push(result.step);
        messages.push(new ToolMessage({ content: result.text, tool_call_id: call.id }));
      }
      messages.push(
        new HumanMessage('上面的写操作已按用户确认执行完毕，请根据工具执行结果用中文简要回复用户。'),
      );
    } else if (pending && RagService.isNegative(message)) {
      const describe = pending.calls.map((call) => RagService.describeToolCall(call)).join('；');
      return {
        message,
        steps: [`🚫 [已取消] ${describe}`],
        totalRounds: 0,
        answer: '好的，已取消该操作。',
      };
    } else {
      if (pending) {
        this.logger?.log(
          `[Agent] 用户没有确认写操作，丢弃待确认动作（${pending.calls.length} 个）`,
        );
      }
      messages = await prompt.formatMessages({ message });
    }

    // ── Agent 循环 ──────────────────────────────────────
    // 每一轮：模型看消息历史 → 决定调用工具还是直接回答
    // 直到模型不再调用工具为止（最多 6 轮，防止死循环）
    while (roundCount < 6) {
      roundCount++;
      this.logger?.log(`[Agent] 第 ${roundCount} 轮`);

      const response = await this.invokeAgentModel(llmWithTools, messages);
      messages.push(response); // 把模型回复加入历史

      const toolCalls = response.tool_calls ?? [];
      const text = RagService.messageText(response.content).trim();
      this.logger?.log(
        `[Agent] 第 ${roundCount} 轮返回：tool_calls=${toolCalls.length}，content=${text}`,
      );

      // tool_calls 为空 → 模型有了最终答案，退出循环
      if (toolCalls.length === 0) {
        answer = text;
        steps.push(`💬 [最终回答] ${text}`);
        break;
      }

      // 读操作立即执行；写操作统一挂起，等用户确认后再执行
      const pendingCalls: PendingToolCall[] = [];
      for (const [toolIndex, toolCall] of toolCalls.entries()) {
        const toolCallId = toolCall.id ?? `tool-call-${roundCount}-${toolIndex}`;
        steps.push(`🔧 [调用工具] ${toolCall.name}(${JSON.stringify(toolCall.args)})`);
        this.logger?.log(`[工具调用] ${toolCall.name} ${JSON.stringify(toolCall.args)}`);

        if (WRITE_TOOL_NAMES.has(toolCall.name)) {
          pendingCalls.push({ id: toolCallId, name: toolCall.name, args: toolCall.args });
          continue;
        }

        const result = await this.executeToolCall(toolMap, toolCall);
        steps.push(result.step);
        messages.push(new ToolMessage({ content: result.text, tool_call_id: toolCallId }));
      }

      // 有写操作 → 挂起，本轮以“请确认”结束；用户下次带同一 sessionId 回复「确认」才会执行
      if (pendingCalls.length > 0) {
        this.storePendingAction(session, {
          sessionId: session,
          message,
          calls: pendingCalls,
          createdAt: Date.now(),
        });
        const describe = pendingCalls.map((call) => RagService.describeToolCall(call)).join('\n');
        answer = `即将执行以下写操作，请确认：\n${describe}\n\n回复「确认」执行，回复「取消」放弃。`;
        steps.push(`⏸️ [等待用户确认] ${describe}`);
        break;
      }
    }

    // 轮次耗尽时兜底：取最后一条有内容的 AIMessage，实在没有再给默认话术
    if (!answer) {
      const lastText = [...messages]
        .reverse()
        .filter((item): item is AIMessage => item instanceof AIMessage)
        .map((item) => RagService.messageText(item.content).trim())
        .find((item) => item.length > 0);
      answer = lastText ?? '抱歉，暂时无法处理您的请求';
      steps.push(`💬 [最终回答] ${answer}`);
    }

    return {
      message,
      steps, // 完整思考和执行步骤（录视频演示重点）
      totalRounds: roundCount,
      answer,
    };
  }

  /** 执行单个工具调用；失败不抛出，把错误文本回传给模型。 */
  private async executeToolCall(
    toolMap: Record<string, StructuredToolInterface>,
    toolCall: { name: string; args: Record<string, unknown> },
  ): Promise<{ step: string; text: string }> {
    const toolFn = toolMap[toolCall.name];
    if (!toolFn) {
      const text = `工具「${toolCall.name}」不存在，可用工具：${Object.keys(toolMap).join(', ')}`;
      return { step: `❌ [错误] ${text}`, text };
    }
    try {
      const result = await toolFn.invoke(toolCall.args);
      const text = typeof result === 'string' ? result : JSON.stringify(result);
      this.logger?.log(`[工具结果] ${text}`);
      return { step: `✅ [工具结果] ${text}`, text };
    } catch (error) {
      const text = `工具「${toolCall.name}」执行失败：${
        error instanceof Error ? error.message : String(error)
      }`;
      this.logger?.error(text);
      return { step: `❌ [错误] ${text}`, text };
    }
  }

  private storePendingAction(sessionId: string, action: PendingAction): void {
    const store = this.pendingActions;
    const now = Date.now();
    for (const [key, value] of store) {
      if (now - value.createdAt > CONFIRMATION_TTL_MS) {
        store.delete(key);
      }
    }
    store.set(sessionId, action);
  }

  private takePendingAction(sessionId: string): PendingAction | undefined {
    const store = this.pendingActions;
    const action = store.get(sessionId);
    if (!action) return undefined;
    store.delete(sessionId);
    return Date.now() - action.createdAt > CONFIRMATION_TTL_MS ? undefined : action;
  }

  private static describeToolCall(call: PendingToolCall): string {
    return `${call.name}(${JSON.stringify(call.args)})`;
  }

  private static isAffirmative(text: string): boolean {
    return RagService.AFFIRMATIVE_REPLIES.has(RagService.normalizeReply(text));
  }

  private static isNegative(text: string): boolean {
    return RagService.NEGATIVE_REPLIES.has(RagService.normalizeReply(text));
  }

  /** 去掉空格和常见标点，只留文字，便于匹配「确认！」「好的~」这类回复 */
  private static normalizeReply(text: string): string {
    return text
      .trim()
      .toLowerCase()
      .replace(/[\s，。！？!?、,.~～"'“”‘’]/g, '');
  }

  /** 模型调用：只对 429 / 5xx / 网络抖动做一次重试，其余错误直接抛出。 */
  private async invokeAgentModel<T>(
    model: { invoke: (input: BaseMessage[]) => Promise<T> },
    messages: BaseMessage[],
  ): Promise<T> {
    for (let attempt = 1; ; attempt++) {
      try {
        return await model.invoke(messages);
      } catch (error) {
        if (attempt >= 2 || !this.isRetryableModelError(error)) {
          throw error;
        }
        this.logger?.warn(
          `[Agent] 模型调用失败，重试 1 次：${error instanceof Error ? error.message : String(error)}`,
        );
        await new Promise((resolve) => setTimeout(resolve, 300));
      }
    }
  }

  private isRetryableModelError(error: unknown): boolean {
    const status = (error as { status?: unknown } | null)?.status;
    if (typeof status === 'number') {
      return status === 429 || status >= 500;
    }
    const code = (error as { code?: unknown } | null)?.code;
    return (
      code === 'ECONNRESET' ||
      code === 'ETIMEDOUT' ||
      code === 'ECONNREFUSED' ||
      code === 'EAI_AGAIN'
    );
  }

  /** content 可能是字符串，也可能是 [{ type: 'text', text: '...' }] 这样的内容块数组。 */
  private static messageText(content: unknown): string {
    if (typeof content === 'string') return content;
    if (Array.isArray(content)) {
      return content
        .map((block) => {
          if (typeof block === 'string') return block;
          if (block && typeof block === 'object' && 'text' in block) {
            const text = (block as { text?: unknown }).text;
            return typeof text === 'string' ? text : '';
          }
          return '';
        })
        .join('');
    }
    if (typeof content === 'number' || typeof content === 'boolean') return String(content);
    return '';
  }

}
