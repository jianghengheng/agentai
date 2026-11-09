import { Body, Controller, Post } from '@nestjs/common';
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
}

