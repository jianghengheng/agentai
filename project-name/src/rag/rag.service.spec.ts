import { BadRequestException, Logger } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { OllamaEmbeddings } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';
import { AIMessage } from '@langchain/core/messages';
import type { PoolClient } from 'pg';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { RagModule } from './rag.module.js';
import { RagService } from './rag.service.js';
import { RagController } from './rag.controller.js';
import type { AddDocumentsDto, QueryDto, SearchDto } from './dto/rag.dto.js';
import { AiModule } from '../ai/ai.module.js';
import { AiService } from '../ai/ai.service.js';

describe('RagService connection lifecycle', () => {
  let module: TestingModule | undefined;
  const ragUrl = 'postgresql://rag:password@localhost:5432/ragdb';
  const businessUrl = 'postgresql://business:password@localhost:5432/business';

  beforeEach(() => {
    vi.stubEnv('DATABASE_URL', businessUrl);
    vi.stubEnv('RAG_DATABASE_URL', ragUrl);
    vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  });

  afterEach(async () => {
    await module?.close();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects missing RAG_DATABASE_URL even when the business connection exists', async () => {
    vi.stubEnv('RAG_DATABASE_URL', undefined);

    await expect(
      Test.createTestingModule({ imports: [AiModule, RagModule] }).compile(),
    ).rejects.toThrow('RAG_DATABASE_URL is required');
  });

  it('checks the independent connection on startup and closes it on shutdown', async () => {
    module = await Test.createTestingModule({ imports: [AiModule, RagModule] }).compile();
    const service = module.get(RagService);
    const pool = service.vectorStore.pool;
    const query = vi.spyOn(pool, 'query').mockResolvedValue({
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      rows: [{ '?column?': 1 }],
      fields: [],
    });

    await module.init();

    expect(pool.options.connectionString).toBe(ragUrl);
    expect(process.env.DATABASE_URL).toBe(businessUrl);
    expect(query).toHaveBeenCalled();
    expect(pool.ended).toBe(false);

    await module.close();
    module = undefined;

    expect(pool.ended).toBe(true);
  });

  it('fails startup and releases the pool when the database is unavailable', async () => {
    module = await Test.createTestingModule({ imports: [AiModule, RagModule] }).compile();
    const pool = module.get(RagService).vectorStore.pool;
    const error = new Error('Database unavailable');
    vi.spyOn(pool, 'query').mockRejectedValue(error);

    await expect(module.init()).rejects.toBe(error);

    expect(pool.ended).toBe(true);
  });
});

describe('RagService chat model', () => {
  let service: RagService;

  beforeEach(() => {
    vi.stubEnv(
      'RAG_DATABASE_URL',
      'postgresql://rag:password@localhost:5432/ragdb',
    );
    vi.stubEnv('VOPENAI_API_KEY', 'test-vopenai-key');
    service = new RagService(new AiService());
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('sends chat completions to the configured provider with deepseek-flash', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'chatcmpl-test',
          object: 'chat.completion',
          created: 0,
          model: 'deepseek-flash',
          choices: [
            {
              index: 0,
              message: { role: 'assistant', content: '你好' },
              finish_reason: 'stop',
            },
          ],
          usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
        }),
        { headers: { 'Content-Type': 'application/json' } },
      ),
    );

    await expect(service.chat('你好')).resolves.toBe('你好');

    expect(fetch).toHaveBeenCalledOnce();
    const [input, init] = fetch.mock.calls[0];
    const request = new Request(input, init);
    expect(request.url).toBe('https://api.vopenai.top/v1/chat/completions');
    expect(request.headers.get('authorization')).toBe(
      'Bearer test-vopenai-key',
    );
    expect(await request.json()).toMatchObject({
      model: 'deepseek-flash',
      messages: [{ role: 'user', content: '你好' }],
    });
  });

  it('requires the provider key before sending a request', async () => {
    vi.stubEnv('VOPENAI_API_KEY', '');
    vi.stubEnv('OPENAI_API_KEY', 'unrelated-openai-key');
    const fetch = vi.spyOn(globalThis, 'fetch');

    await expect(service.chat('你好')).rejects.toThrow(
      'VOPENAI_API_KEY is required',
    );

    expect(fetch).not.toHaveBeenCalled();
  });
});

describe('RagService document ingestion', () => {
  let service: RagService;
  const collectionId = '00000000-0000-0000-0000-000000000001';
  const clientQuery = vi.fn();
  const release = vi.fn();

  beforeEach(() => {
    vi.stubEnv(
      'RAG_DATABASE_URL',
      'postgresql://rag:password@localhost:5432/ragdb',
    );
    service = new RagService(new AiService());
    clientQuery.mockReset().mockResolvedValue({ rows: [] });
    release.mockReset();
    vi.spyOn(service.vectorStore.pool, 'connect').mockResolvedValue({
      query: clientQuery,
      release,
    } as unknown as PoolClient);
    vi.spyOn(service.vectorStore.pool, 'query').mockResolvedValue({
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      rows: [{ uuid: collectionId }],
      fields: [],
    });
  });

  afterEach(async () => {
    await service.onApplicationShutdown();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('inserts chunk content, embeddings, metadata and ids into the configured columns', async () => {
    const embed = vi
      .spyOn(OllamaEmbeddings.prototype, 'embedDocuments')
      .mockResolvedValue([[0.1, 0.2, 0.3]]);

    await service.addDocuments({
      collectionName: 'default',
      documents: [
        {
          id: 'doc-1',
          content: 'hello world',
          metadata: { source: 'test' },
        },
      ],
      chunkSize: 100,
      chunkOverlap: 0,
    });

    expect(embed).toHaveBeenCalledWith(['hello world']);
    const insert = clientQuery.mock.calls.find(([sql]) => String(sql).includes('INSERT INTO'));
    expect(insert).toBeDefined();
    const [sql, values] = insert!;
    expect(String(sql).replace(/\s+/g, ' ')).toContain(
      'INSERT INTO "public"."langchain_pg_embedding" ("document", "embedding", "cmetadata", "collection_id", "id")',
    );
    expect(values).toEqual([
      'hello world',
      '[0.1,0.2,0.3]',
      expect.objectContaining({
        source: 'test',
        sourceId: 'doc-1',
        chunkIndex: 0,
        totalChunks: 1,
      }),
      '00000000-0000-0000-0000-000000000001',
      'doc-1-chunk-0',
    ]);
  });

  it('updates repeated chunk ids and removes obsolete chunks in one transaction', async () => {
    vi.spyOn(OllamaEmbeddings.prototype, 'embedDocuments').mockResolvedValue([[0.1, 0.2, 0.3]]);
    const dto: AddDocumentsDto = {
      collectionName: 'default',
      documents: [{ id: 'doc-001', content: 'updated content' }],
    };

    await service.addDocuments(dto);
    await service.addDocuments(dto);

    const inserts = clientQuery.mock.calls.filter(([sql]) => String(sql).includes('INSERT INTO'));
    expect(inserts).toHaveLength(2);
    for (const [sql] of inserts) {
      expect(String(sql)).toContain('ON CONFLICT ("id") DO UPDATE');
      for (const column of ['document', 'embedding', 'cmetadata', 'collection_id']) {
        expect(String(sql)).toContain(`"${column}" = EXCLUDED."${column}"`);
      }
    }
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('NOT ("id" = ANY($3::text[]))'),
      [collectionId, ['doc-001'], ['doc-001-chunk-0']],
    );
    expect(clientQuery.mock.calls[0][0]).toBe('BEGIN');
    expect(clientQuery.mock.calls.at(-1)![0]).toBe('COMMIT');
    expect(clientQuery.mock.calls.filter(([sql]) => String(sql).includes('pg_advisory_xact_lock'))).toHaveLength(2);
    expect(release).toHaveBeenCalledTimes(2);
  });

  it('rolls back a failed update and releases the connection', async () => {
    vi.spyOn(OllamaEmbeddings.prototype, 'embedDocuments').mockResolvedValue([[0.1, 0.2, 0.3]]);
    const error = new Error('Database write failed');
    clientQuery.mockImplementation(async (sql: string) => {
      if (sql.includes('DELETE FROM')) throw error;
      return { rows: [] };
    });

    await expect(service.addDocuments({
      collectionName: 'default',
      documents: [{ id: 'doc-001', content: 'updated content' }],
    })).rejects.toBe(error);

    expect(clientQuery).toHaveBeenCalledWith('ROLLBACK');
    expect(clientQuery).not.toHaveBeenCalledWith('COMMIT');
    expect(release).toHaveBeenCalledOnce();
  });

  it('leaves stored chunks untouched when embedding generation fails', async () => {
    const error = new Error('Ollama unavailable');
    vi.spyOn(OllamaEmbeddings.prototype, 'embedDocuments').mockRejectedValue(error);

    await expect(service.addDocuments({
      collectionName: 'default',
      documents: [{ id: 'doc-001', content: 'updated content' }],
    })).rejects.toBe(error);

    expect(service.vectorStore.pool.connect).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });

  it('removes old chunks when a document is updated to empty content', async () => {
    const embed = vi.spyOn(OllamaEmbeddings.prototype, 'embedDocuments').mockResolvedValue([]);

    await expect(service.addDocuments({
      collectionName: 'default',
      documents: [{ id: 'doc-001', content: '' }],
    })).resolves.toMatchObject({ totalChunks: 0 });

    expect(embed).not.toHaveBeenCalled();
    expect(clientQuery).toHaveBeenCalledWith(
      expect.stringContaining('DELETE FROM'),
      [collectionId, ['doc-001'], []],
    );
    expect(clientQuery).toHaveBeenLastCalledWith('COMMIT');
  });

  it('rejects duplicate source ids within a single request before writing', async () => {
    const embed = vi.spyOn(OllamaEmbeddings.prototype, 'embedDocuments').mockResolvedValue([]);

    await expect(service.addDocuments({
      collectionName: 'default',
      documents: [
        { id: 'doc-001', content: 'first' },
        { id: 'doc-001', content: 'second' },
      ],
    })).rejects.toThrow(BadRequestException);

    expect(embed).not.toHaveBeenCalled();
    expect(clientQuery).not.toHaveBeenCalled();
  });
});

describe('RagService question answering', () => {
  let service: RagService | undefined;

  beforeEach(() => {
    vi.stubEnv('RAG_DATABASE_URL', 'postgresql://rag:password@localhost:5432/ragdb');
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    vi.stubEnv('VOPENAI_API_KEY', 'test-vopenai-key');
  });

  afterEach(async () => {
    await service?.onApplicationShutdown();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('rejects a search-style payload with query instead of question before retrieval', async () => {
    service = new RagService(new AiService());
    const search = vi.spyOn(service.vectorStore, 'similaritySearch').mockResolvedValue([]);
    const invoke = vi.spyOn(ChatOpenAI.prototype, 'invoke').mockResolvedValue(new AIMessage('answer'));
    const controller = new RagController(service);

    await expect(controller.query({
      collectionName: 'frontend-docs',
      query: 'Vue3 怎么做状态管理',
      topK: 3,
    } as unknown as QueryDto)).rejects.toThrow('question must be a non-empty string');

    expect(search).not.toHaveBeenCalled();
    expect(invoke).not.toHaveBeenCalled();
  });

  it.each([null, 123, {}, ['question'], '', '   '])(
    'rejects an invalid question (%j) before retrieval',
    async (question) => {
      service = new RagService(new AiService());
      const search = vi.spyOn(service.vectorStore, 'similaritySearch').mockResolvedValue([]);
      const invoke = vi.spyOn(ChatOpenAI.prototype, 'invoke').mockResolvedValue(new AIMessage('answer'));

      await expect(service.query({
        collectionName: 'frontend-docs',
        question,
      } as QueryDto)).rejects.toThrow(BadRequestException);

      expect(search).not.toHaveBeenCalled();
      expect(invoke).not.toHaveBeenCalled();
    },
  );

  it('embeds the question text and includes retrieved content in the model prompt', async () => {
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    const invoke = vi.spyOn(ChatOpenAI.prototype, 'invoke').mockResolvedValue(new AIMessage('Use Pinia.'));
    service = new RagService(new AiService());
    vi.spyOn(service.vectorStore.pool, 'query')
      .mockResolvedValueOnce({ rows: [{ uuid: '00000000-0000-0000-0000-000000000001' }] })
      .mockResolvedValueOnce({ rows: [{
        id: 'doc-001-chunk-0',
        document: 'Pinia manages shared state in Vue3.',
        cmetadata: { sourceId: 'doc-001' },
        _distance: 0.1,
      }] });

    const result = await new RagController(service).query({
      collectionName: 'frontend-docs',
      question: 'Vue3 怎么做状态管理',
      topK: 3,
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [input, init] = fetch.mock.calls[0];
    expect(await new Request(input, init).json()).toMatchObject({
      model: 'mxbai-embed-large:latest',
      input: ['Vue3 怎么做状态管理'],
    });
    expect(invoke).toHaveBeenCalledWith(expect.stringContaining('Pinia manages shared state in Vue3.'));
    expect(invoke).toHaveBeenCalledWith(expect.stringContaining('Question: Vue3 怎么做状态管理'));
    expect(result).toMatchObject({
      question: 'Vue3 怎么做状态管理',
      answer: 'Use Pinia.',
      context: 'Pinia manages shared state in Vue3.',
    });
  });
});

describe('RagService search embeddings', () => {
  let service: RagService | undefined;

  afterEach(async () => {
    await service?.onApplicationShutdown();
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  it('sends the query text as a string array to Ollama', async () => {
    vi.stubEnv('RAG_DATABASE_URL', 'postgresql://rag:password@localhost:5432/ragdb');
    vi.stubEnv('OLLAMA_BASE_URL', 'http://localhost:11434');
    const fetch = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), {
        headers: { 'Content-Type': 'application/json' },
      }),
    );
    service = new RagService(new AiService());
    vi.spyOn(service.vectorStore.pool, 'query').mockResolvedValue({
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      rows: [{ uuid: '00000000-0000-0000-0000-000000000001' }],
      fields: [],
    });
    const controller = new RagController(service);

    await controller.search({
      collectionName: 'frontend-docs',
      query: 'Vue3 怎么做状态管理',
      topK: 3,
    });

    expect(fetch).toHaveBeenCalledOnce();
    const [input, init] = fetch.mock.calls[0];
    const request = new Request(input, init);
    expect(request.url).toBe('http://localhost:11434/api/embed');
    expect(await request.json()).toMatchObject({
      model: 'mxbai-embed-large:latest',
      input: ['Vue3 怎么做状态管理'],
    });
  });

  it('keeps the pool available for ingestion after a search', async () => {
    vi.stubEnv('RAG_DATABASE_URL', 'postgresql://rag:password@localhost:5432/ragdb');
    service = new RagService(new AiService());
    vi.spyOn(OllamaEmbeddings.prototype, 'embedQuery').mockResolvedValue([0.1, 0.2, 0.3]);
    vi.spyOn(OllamaEmbeddings.prototype, 'embedDocuments').mockResolvedValue([[0.1, 0.2, 0.3]]);
    vi.spyOn(service.vectorStore.pool, 'connect').mockResolvedValue({
      query: vi.fn().mockResolvedValue({ rows: [] }),
      release: vi.fn(),
    } as unknown as PoolClient);
    vi.spyOn(service.vectorStore.pool, 'query').mockResolvedValue({
      command: 'SELECT',
      rowCount: 1,
      oid: 0,
      rows: [{ uuid: '00000000-0000-0000-0000-000000000001' }],
      fields: [],
    });

    await service.search({ collectionName: 'default', query: 'Vue3', topK: 3 });

    expect(service.vectorStore.pool.ended).toBe(false);
    await expect(service.addDocuments({
      collectionName: 'default',
      documents: [{ id: 'doc-after-search', content: 'Vue3 uses Pinia for state management' }],
    })).resolves.toMatchObject({ success: true, totalChunks: 1 });
    expect(service.vectorStore.pool.ended).toBe(false);

    await service.onApplicationShutdown();
    expect(service.vectorStore.pool.ended).toBe(true);
  });

  it.each([undefined, null, 123, {}, ['query'], '', '   '])(
    'rejects an invalid query (%j) before calling Ollama or PostgreSQL',
    async (query) => {
      vi.stubEnv('RAG_DATABASE_URL', 'postgresql://rag:password@localhost:5432/ragdb');
      service = new RagService(new AiService());
      const embed = vi
        .spyOn(OllamaEmbeddings.prototype, 'embedQuery')
        .mockResolvedValue([0.1, 0.2, 0.3]);
      const databaseQuery = vi.spyOn(service.vectorStore.pool, 'query').mockResolvedValue({
        command: 'SELECT',
        rowCount: 1,
        oid: 0,
        rows: [{ uuid: '00000000-0000-0000-0000-000000000001' }],
        fields: [],
      });

      await expect(service.search({
        collectionName: 'frontend-docs',
        query,
      } as SearchDto)).rejects.toThrow(BadRequestException);

      expect(embed).not.toHaveBeenCalled();
      expect(databaseQuery).not.toHaveBeenCalled();
    },
  );
});
