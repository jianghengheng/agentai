import { Body, Controller, Get, Post } from '@nestjs/common';
import { RagService } from './rag.service.js';
import { AddDocumentsDto, QueryDto, SearchDto } from './dto/rag.dto.js';
import { get } from 'http';
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
    async query(@Body() dto: QueryDto) {
        return this.ragService.query(dto);
    }

}