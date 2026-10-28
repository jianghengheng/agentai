import 'dotenv/config';
import {
  BadRequestException,
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

import { ChatPromptTemplate, HumanMessagePromptTemplate, SystemMessagePromptTemplate } from '@langchain/core/prompts'

@Injectable()
export class RagService implements OnModuleInit, OnApplicationShutdown {
  private readonly logger = new Logger(RagService.name);
  // The existing TEXT id column has no default: pass ids when adding documents.
  readonly vectorStore: PGVectorStore;

  constructor(private readonly ai: AiService) {
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
  async query(dto: QueryDto) {
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
    const response = await this.ai.llm.invoke(promptValue);
    return {
      success: true,
      backend: 'pgvector',
      collectionName: dto.collectionName,
      question: dto.question,
      topK: dto.topK ?? 5,
      answer: response.text,
      context,
      token:response.usage_metadata
    };
  }
}
