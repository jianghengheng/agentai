import { Body, Controller, Inject, Post } from '@nestjs/common';
import { EmbedService } from './embed.service.js';
import { EmbedSingleDto, EmbedBatchDto, EmbedQueryDto } from './dto/embed.dto.js';
import { ApiBody, ApiCreatedResponse, ApiOperation } from '@nestjs/swagger';

@Controller('embed')
export class EmbedController {
    constructor(
        @Inject(EmbedService) private readonly embedService: EmbedService,
    ) {
    }
    //post
    @Post('single')
    @ApiOperation({ summary: '单条数据向量化' })
    @ApiBody({
        type: EmbedSingleDto,
        required: true,
        examples: {
            createEmbedding: {
                summary: '创建嵌入',
                value: { text: 'Hello, my dog is cute' },
            },
        },
    })

    async createSingle(@Body() dto: EmbedSingleDto) {
        return this.embedService.createSingle(dto.text);
    }
    @Post('batch')
    @ApiOperation({ summary: '批量数据向量化' })
    @ApiBody({
        type: EmbedBatchDto,
        required: true,
        examples: {
            createEmbedding: {
                summary: '创建嵌入',
                value: { texts: ['Hello, my dog is cute', 'Hello, my cat is cute'] },
            },
        },
    })
    @ApiCreatedResponse({ description: '嵌入创建成功' })
    async createBatch(@Body() dto: EmbedBatchDto) {
        return this.embedService.createBatch(dto.texts);
    }
    @Post('query')
    @ApiOperation({ summary: '查询数据向量化' })
    @ApiBody({
        type: EmbedQueryDto,
        required: true,
        examples: {
            createEmbedding: {
                summary: '创建嵌入',
                value: { query: 'What is the capital of France?', documents: ['Paris is the capital of France.', 'Berlin is the capital of Germany.'] },
            },
        },
    })
    @ApiCreatedResponse({ description: '查询结果' })
    async createQuery(@Body() dto: EmbedQueryDto) {

        return this.embedService.createQuery(dto.query, dto.documents);
    }

}
