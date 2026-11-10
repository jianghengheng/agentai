import { Body, Controller, Get, Post, Query } from '@nestjs/common';
import { LanggraphService } from './langgraph.service.js';

@Controller('langgraph')
export class LanggraphController {
    constructor(
        private readonly langgraphService: LanggraphService,
    ) { }


    @Post('run')
    async runLanggraph(@Body() body: { message: string; threadId?: string }) {
        return this.langgraphService.runLanggraph(body.message, body.threadId);
    }
    @Get('history')
    async getModelHistory(@Query('threadId') threadId: string) {
        return this.langgraphService.getModelHistory(threadId);
    }

    @Post('artgraph')
    async runArtGraph(@Body() body: { article: string; threadId?: string }) {
        return this.langgraphService.artGraph(body.article, body.threadId);
    }
    @Post('mod')
    async getMod(@Body() body: { message: string; threadId?: string }) {
        return this.langgraphService.getMod(body.message, body.threadId);
    }
    @Post('more')
    async getMore(@Body() body: { task: string }) {
        return this.langgraphService.runLanggraphParallel(body.task);
    }

    @Post('supervisor')
    async getsupervisor(@Body() body: { userInput: string }) {
        return this.langgraphService.supervisor(body.userInput);
    }

}

