import { Body, Controller, Get, Post, Res } from '@nestjs/common';
import { RagService } from './rag.service.js';
import { AddDocumentsDto, QueryDto, SearchDto } from './dto/rag.dto.js';
import type { Response } from 'express';
@Controller('rag')
export class RagController {

    constructor(
        private readonly ragService: RagService,
    ) { }


    @Post('add-documents')
    async addDocuments(@Body() dto: AddDocumentsDto) {
        return this.ragService.addDocuments(dto);
    }
    @Post('search')
    async search(@Body() dto: SearchDto) {
        return this.ragService.search(dto);
    }
    @Post('query')
    async query(@Body() dto: QueryDto, @Res() res: Response) {
        return this.ragService.query(dto, res);
    }

    @Post('translate')
    async translate(@Body() { message, targetLanguage }: { message: string; targetLanguage: string }) {
        return this.ragService.translate(message, targetLanguage);
    }
    @Post('chain')
    async chain(@Body() { article }: { article: string }) {
        return this.ragService.chain(article);
    }
    @Post('chainmore')
    async chainmore(@Body() { article }: { article: string }) {
        return this.ragService.chainmore(article);
    }
    @Post('runagent')
    async runagent(@Body() { message, sessionId }: { message: string; sessionId?: string }) {
        return this.ragService.runagent(message, sessionId);
    }
}
