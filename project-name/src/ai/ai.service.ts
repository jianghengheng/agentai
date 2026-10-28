import 'dotenv/config';
import { Injectable } from '@nestjs/common';
import { OllamaEmbeddings } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';

@Injectable()
export class AiService {
  readonly embeddings: OllamaEmbeddings;
  readonly llm: ChatOpenAI;

  constructor() {
    this.embeddings = new OllamaEmbeddings({
      model: 'mxbai-embed-large:latest',
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
    });

    this.llm = new ChatOpenAI({
      apiKey: process.env.VOPENAI_API_KEY?.trim(),
      model: 'deepseek-flash',
      configuration: {
        baseURL: 'https://api.vopenai.top/v1',
      },
      temperature: 0.3,
      useResponsesApi: false,
      timeout: 60000,
    });
  }
}
