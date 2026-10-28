import { Injectable } from '@nestjs/common';
import { AiService } from '../ai/ai.service.js';

@Injectable()
export class EmbedService {
    constructor(private readonly ai: AiService) {}
    async createSingle(text: string) {
        const result = await this.ai.embeddings.embedQuery(text);

        // Implement the logic for embedding a single text here
        return { text, result, resultLength: result.length };
    }

    async createBatch(texts: string[]) {
        // Implement the logic for embedding multiple texts here
        const results = await this.ai.embeddings.embedDocuments(texts);
        return results.map((result, index) => ({ text: texts[index], result, resultLength: result.length }));
    }

    async createQuery(text: string, documents: string[]) {
        // Implement the logic for querying embeddings here
        const result = await this.ai.embeddings.embedQuery(text);
        const documentsEmbeddings = await this.ai.embeddings.embedDocuments(documents);
      const docementresult= documentsEmbeddings.map((docEmbedding, index) => {
            const similarity = this.similarity(result, docEmbedding);
            documentsEmbeddings.sort((a, b) => this.similarity(result, b) - this.similarity(result, a));
            return { index, text: documents[index], similarity: similarity.toFixed(4) };
        });
        return { query: text, results: docementresult };
    }
    private similarity(result: number[], docEmbedding: number[]) {
        // Implement a simple cosine similarity calculation
        const dotProduct = result.reduce((sum, value, index) => sum + value * docEmbedding[index], 0);
        const magnitudeA = Math.sqrt(result.reduce((sum, value) => sum + value * value, 0));
        const magnitudeB = Math.sqrt(docEmbedding.reduce((sum, value) => sum + value * value, 0));
        return dotProduct / (magnitudeA * magnitudeB);
    }

}
