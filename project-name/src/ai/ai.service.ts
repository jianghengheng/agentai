import 'dotenv/config';
import { Injectable } from '@nestjs/common';
import { OllamaEmbeddings } from '@langchain/ollama';
import { ChatOpenAI } from '@langchain/openai';

/**
 * deepseek-flash 是思考模式（thinking mode）：带 tool_calls 的 assistant 消息
 * 必须把 reasoning_content 原样回传，否则第二次请求会直接返回 400：
 * "The `reasoning_content` in the thinking mode must be passed back to the API."
 *
 * 但 @langchain/openai 序列化 assistant 消息时只保留 role/content/tool_calls，
 * 会把 reasoning_content 丢掉。这里在 HTTP 层补回该字段（空字符串即可通过校验）。
 * 只影响带 tool_calls 的 assistant 消息，普通对话不受影响。
 */
const fetchWithReasoningContent: typeof fetch = async (input, init) => {
  if (typeof init?.body === 'string' && init.body.includes('"tool_calls"')) {
    try {
      const payload = JSON.parse(init.body) as {
        messages?: Array<Record<string, unknown>>;
      };
      if (Array.isArray(payload.messages)) {
        let patched = false;
        payload.messages = payload.messages.map((message) => {
          if (
            message.role !== 'assistant' ||
            !message.tool_calls ||
            message.reasoning_content != null
          ) {
            return message;
          }
          patched = true;
          return { ...message, reasoning_content: '' };
        });
        if (patched) {
          return globalThis.fetch(input, { ...init, body: JSON.stringify(payload) });
        }
      }
    } catch {
      // 请求体不是 JSON 时保持原样
    }
  }
  return globalThis.fetch(input, init);
};

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
        fetch: fetchWithReasoningContent,
      },
      temperature: 0.3,
      useResponsesApi: false,
      timeout: 60000,
    });

  }
}
