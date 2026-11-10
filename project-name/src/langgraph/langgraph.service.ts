import { randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages';
import {
    END,
    MessagesAnnotation,
    START,
    StateGraph,
    Annotation,
    Command,
    Send,
    task
} from '@langchain/langgraph';
import { AiService } from '../ai/ai.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { tool } from '@langchain/core/tools';
import { z } from 'zod';
import { ToolNode } from '@langchain/langgraph/prebuilt';
import { report } from 'node:process';
import { Agent } from 'node:http';


//自定义 state 定义这个工作流所有节点共享的数据结构


const articleAnnotation = Annotation.Root({
    articleContent: Annotation<string>(),
    title: Annotation<string>(),
    summary: Annotation<string>(),
    keywords: Annotation<string[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
    logs: Annotation<string[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
});
// 并行

const parallelAnnotation = Annotation.Root({
    tasks: Annotation<string>(),
    results: Annotation<{ task: string; result: string }[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
    finalReport: Annotation<string>(),
})
// 子任务
const subState = Annotation.Root({
    tasks: Annotation<string>(),

})
const SupervisorState = Annotation.Root({
    messages: MessagesAnnotation.spec.messages,
    nextAgent: Annotation<string>(),
    completedAgents: Annotation<string[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
    response: Annotation<string>(),

})
const reviewState = Annotation.Root({
    code: Annotation<string>(),
    language: Annotation<string>(),
    result: Annotation<{
        aspect: string,
        score: string,
        issues: string

    }[]>({
        reducer: (prev, curr) => [...prev, ...curr],
        default: () => [],
    }),
    report: Annotation<string>()
})
const singleState = Annotation.Root({
    code: Annotation<string>(),
    language: Annotation<string>(),
    aspect: Annotation<string>(),
    prompt: Annotation<string>()
})

@Injectable()
export class LanggraphService {
    private getUserEmailTool = tool(
        async (input: { userId: string }) => {
            const user = await this.prisma.db.orm.public.User.first({ id: input.userId });
            if (!user) {
                throw new Error(`User with ID ${input.userId} not found`);
            }
            return user.email;
        },


        {
            name: 'get_user_email',
            description: 'Get the email of a user by their ID',
            schema: z.object({
                userId: z.string().describe('The ID of the user to retrieve the email for'),
            }),
        }
    )
    //工具 查询员工是否在职
    private checkUserTool = tool(
        // 第一个参数：执行函数
        async ({ userName }: { userName: string }) => {
            const results = await this.prisma.db.orm.public.User.where({ name: userName }).all();
            if (results.length > 0) {
                return `User "${userName}" is available in the database.results: ${JSON.stringify(results)}`;
            } else {
                return `User "${userName}" is not found in the database.`;
            }
        },
        // 第二个参数：配置对象
        {
            name: 'check_user',
            description: "检查当前用户是否在数据库中存在 当用户询问'xxx是否在职','xxx离职了么' ",
            schema: z.object({
                userName: z.string().describe("The name of the user to check"),
            }),
        }


    );
    //修改用户邮箱
    private updateUserEmailTool = tool(
        async ({ userId, newEmail }: { userId: string; newEmail: string }) => {
            const user = await this.prisma.db.orm.public.User.first({ id: userId });
            if (!user) {
                throw new Error(`User with ID ${userId} not found`);
            }
            const updatedUser = await this.prisma.db.orm.public.User.where({ id: userId }).update({ email: newEmail });
            return updatedUser;
        },
        {
            name: 'update_user_email',
            description: 'Update the email of a user by their ID',
            schema: z.object({
                userId: z.string().describe('The ID of the user to update the email for'),
                newEmail: z.string().email().describe('The new email address for the user'),
            }),
        }
    )
    constructor(
        private readonly ai: AiService,
        @Inject(PrismaService) private readonly prisma: PrismaService,
    ) {




    }

    createGraph() {
        const callModel = async (state: typeof MessagesAnnotation.State) => {
            const response = await this.ai.llm.invoke(state.messages);
            return { messages: [response] };
        };

        return new StateGraph(MessagesAnnotation)
            .addNode('call_model', callModel)
            .addEdge(START, 'call_model')
            .addEdge('call_model', END)
            .compile({
                checkpointer: this.prisma.checkpointer,
                store: this.prisma.store,
            });
    }

    createArticleGraph() {
        // 节点 1 提取关键词
        const extractKeywords = async (state: typeof articleAnnotation.State) => {
            const t0 = new Date().getTime();
            const response = await this.ai.llm.invoke([
                new SystemMessage(`你是一个专业的文本分析助手，负责从文章中提取关键词。请从以下文章中提取出4-7 个的关键词，用逗号分隔，并且不要包含任何其他的文字或解释。`),
                new HumanMessage(state.articleContent),
            ]);
            const t1 = new Date().getTime();
            console.log(`extractKeywords time: ${t1 - t0}ms`);
            return { keywords: response.text.split(',').map((keyword) => keyword.trim()), logs: [`提取关键词耗时: ${t1 - t0}ms`] };


        }
        //生成摘呀要
        const generateSummary = async (state: typeof articleAnnotation.State) => {
            const t0 = new Date().getTime();
            const response = await this.ai.llm.invoke([
                new SystemMessage(`你是一个专业的文本分析助手，负责从文章中生成摘要。请从以下文章 和关键词:${state.keywords}中生成一个简明扼要的摘要，字数控制在 100 字以内。`),
                new HumanMessage(state.articleContent),
            ]);
            const t1 = new Date().getTime();
            console.log(`generateSummary time: ${t1 - t0}ms`);
            return { summary: response.text, logs: [`生成摘要耗时: ${t1 - t0}ms`] };

        }
        //生成标题
        const generateTitle = async (state: typeof articleAnnotation.State) => {
            const t0 = new Date().getTime();
            const response = await this.ai.llm.invoke([
                new SystemMessage(`你是一个专业的文本分析助手，负责从文章中生成标题。请从以下文章中生成一个简明扼要的标题，字数控制在 10 字以内，并且不要包含任何其他的文字或解释。`),
                new HumanMessage(state.articleContent),
            ]);
            const t1 = new Date().getTime();
            console.log(`generateTitle time: ${t1 - t0}ms`);
            return { title: response.text, logs: [`生成标题耗时: ${t1 - t0}ms`] };

        }
        const articleGraph = new StateGraph(articleAnnotation)
            .addNode('generateTitle', generateTitle)
            .addNode('extractKeywords', extractKeywords)
            .addNode('generateSummary', generateSummary)
            .addEdge(START, 'extractKeywords')
            .addEdge('extractKeywords', 'generateSummary')
            .addEdge('generateSummary', 'generateTitle')
            .addEdge('generateTitle', END)
            .compile({
                checkpointer: this.prisma.checkpointer,
                store: this.prisma.store,
            });
        return articleGraph;

    }

    async runLanggraph(message: string, threadId?: string) {
        const currentThreadId = threadId ?? randomUUID();
        const state = await this.createGraph().invoke(
            { messages: [new HumanMessage(message)] },
            { configurable: { thread_id: currentThreadId } },
        );

        return {
            threadId: currentThreadId,
            state,
        };
    }
    async artGraph(article: string, threadId?: string) {
        const res = await this.createArticleGraph().invoke(
            { articleContent: article },
            { configurable: { thread_id: threadId ?? randomUUID() } },
        );
        return {
            threadId: threadId ?? randomUUID(),
            res
        };
    }
    // 获取会话的完整聊天记录（用户消息 + 模型回复）
    async getModelHistory(threadId: string) {
        const snapshot = await this.createArticleGraph().getState({
            configurable: {
                thread_id: threadId,
            },
        });

        return snapshot.values.messages ?? [];
    }



    async getMod(message: string, threadId?: string) {
        const tools = [this.getUserEmailTool, this.checkUserTool, this.updateUserEmailTool];
        const lmmtools = this.ai.llm.bindTools(tools)
        const toolNode = new ToolNode(tools)
        const callModel = async (state: typeof MessagesAnnotation.State) => {
            const msg = [new SystemMessage(`可用的 tool 有${tools}`), ...state.messages]
            const response = await lmmtools.invoke(msg);
            return { messages: [response] };
        }
        const shouldContinue = (state: typeof MessagesAnnotation.State) => {
            const lastMessage = state.messages.at(-1) as AIMessage;
            return (lastMessage.tool_calls?.length ?? 0) > 0 ? 'tools' : END;

        }
        const graph = new StateGraph(MessagesAnnotation)
            .addNode('call_model', callModel)
            .addNode('tools', toolNode)
            .addEdge(START, 'call_model')
            .addConditionalEdges('call_model', shouldContinue, {
                tools: 'tools',
                [END]: END,
            })
            .addEdge('tools', 'call_model')
            .compile({
                checkpointer: this.prisma.checkpointer,
                store: this.prisma.store,
            });
        // 请求开始时只生成一次，执行和返回共用
        const currentThreadId = threadId ?? randomUUID();

        // 模型输入只读取状态中的消息，别重复插入

        const content = await graph.invoke(
            { messages: [new HumanMessage(message)] },
            { configurable: { thread_id: threadId ?? currentThreadId }, recursionLimit: 10 },


        );
        return {
            threadId: threadId ?? currentThreadId,
            content

        };


    }

    //并行
    async runLanggraphParallel(task: string) {
        const currentThreadId = randomUUID();

        // 拆分节点
        const splitTask = async (state: typeof parallelAnnotation.State) => {
            const res = await this.ai.llm.invoke([
                new HumanMessage(`请把一下任务拆分成独立的3个子任务：${state.tasks} 要求： 1. 每个子任务都要具体明确 2.子任务单独一行`)

            ])
            console.log(res, state.tasks, '子任务')
            const subtastak = (res.content as string).split('\n').map(t => t.trim()).filter(Boolean)
            // subtastak.forEach((t) => {
            //     console.log(
            //         t
            //     );
            // })
            return new Command({
                goto: subtastak.map((t) => new Send('processSubTask', { tasks: t }))
            })

        }
        const processSubTask = async (state: typeof subState.State) => {

            const res = await this.ai.llm.invoke([
                new HumanMessage(`请完成下面任务：${state.tasks} `)

            ])
            console.log(res, state, '123');

            return {
                results: [{
                    task: state.tasks,
                    result: res.content
                }]
            }

        }
        //汇总
        const mergeNode = async (state: typeof parallelAnnotation.State) => {

            const text = state.results
                .map(({ task, result }) => `子任务：${task}\n结果：${result}`)
                .join('\n\n');
            const res = await this.ai.llm.invoke([
                new HumanMessage(`更具以下内容生成最终报告${text}`)
            ])
            return {
                finalReport: res.content
            }
        }
        const graph = new StateGraph(parallelAnnotation)
            .addNode('splitTask', splitTask, { ends: ['processSubTask'] })
            .addNode('processSubTask', processSubTask, { ends: ['mergeNode'] })
            .addNode('mergeNode', mergeNode)
            .addEdge(START, 'splitTask')
            .addEdge(['processSubTask'], 'mergeNode')
            .addEdge('mergeNode', END)
            .compile({
                checkpointer: this.prisma.checkpointer,
                store: this.prisma.store,
            });

        return await graph.invoke({
            tasks: task
        },
            { configurable: { thread_id: currentThreadId }, recursionLimit: 10 },)

    }

    async supervisor(userInput: string) {
        const supervisor = async (state: typeof SupervisorState.State) => {
            const done = state.completedAgents.length ? `已完成：${state.completedAgents.join(',')}` : '尚未调用'

            const res = await this.ai.llm.invoke([
                new SystemMessage(`你是任务协调者，管理专业的 agent更具任务需求选择 Agent
            - researcher：收集信息、搜索资料
            - analyst：数据分析、逻辑推理
            - writer：撰写报告、优化表达
            ——coding：写代码的
            规则:
            1.更具用户任务需求选择对应的 agent
            2. ${done}
            3. 所有必要工作完成后输出 FINISH
            4. 只输出下一个 Agent 名称或 FINISH，不要其他内容
         可选值：coding | researcher | analyst | writer | FINISH`),
                ...state.messages])

            const next = String(res.content).trim()
            const valid = ['coding', 'researcher', 'analyst', 'writer', 'FINISH']
            const safeNext = valid.includes(next) ? next : 'FINISH'

            return {
                nextAgent: safeNext,
                // 把调度决定记录到消息历史，让 Worker 有上下文
                messages: [new AIMessage(`[Supervisor] 下一步 → ${safeNext}`)],
            }


        }
        // 路由函数：FINISH → END，其他 → 对应 Worker 节点
        const routeToAgent = (state: typeof SupervisorState.State) =>
            state.nextAgent === 'FINISH' ? END : state.nextAgent
        const workagent = (agentName: string, agentprompt: string) => async (state: typeof SupervisorState.State) => {
            // 取第一条用户消息作为任务描述
            const userMsg = state.messages.find(m => m._getType?.() === 'human')
            // 取最近 4 条消息作为上下文（包含其他 Agent 的输出）
            const context = state.messages.slice(-4).map(m => m.content).join('\n')

            const res = await this.ai.llm.invoke([
                new SystemMessage(agentprompt),
                new HumanMessage(`原始任务：${userMsg?.content ?? ''}\n\n当前上下文：\n${context}`)
            ])
            return {
                messages: [new AIMessage(`[${agentName}] ${res.content}`)],
                completedAgents: [agentName],
            }

        }

        const graph = new StateGraph(SupervisorState)
            .addNode('supervisor', supervisor)
            .addNode('researcher', workagent('researcher', '你是研究员，擅长收集整理信息，提供详细调研结果。'))
            .addNode('analyst', workagent('analyst', '你是分析师，擅长数据分析，提供洞察和建议。'))
            .addNode('writer', workagent('writer', '你是写作专家，把信息整理成清晰专业的报告。'))
            .addNode('coding', workagent('coding', '你是写代码专家，把用户要求写出最好的代码。'))
            .addEdge(START, 'supervisor')
            .addConditionalEdges('supervisor', routeToAgent, {
                researcher: 'researcher',
                analyst: 'analyst',
                writer: 'writer',
                coding: 'coding',
                [END]: END,

            })
            .addEdge('researcher', 'supervisor')
            .addEdge('writer', 'supervisor')
            .addEdge('analyst', 'supervisor')
            .addEdge('coding', 'supervisor')
            .compile()
        const result = await graph.invoke(
            { messages: [new HumanMessage(userInput)] },
            { recursionLimit: 30 }
        )

        const messages = result.messages as AIMessage[]
        const agentLog = messages
            .filter(m => typeof m.content === 'string' && (m.content as string).startsWith('['))
            .map(m => m.content as string)

        const writerOutputs = agentLog.filter(l => l.startsWith('[writer]'))
        const finalReport = writerOutputs.length
            ? writerOutputs.at(-1)!.replace('[writer] ', '')
            : agentLog.at(-1) ?? '无输出'

        return {
            agentLog,
            completedAgents: result.completedAgents,
            finalReport,
        }

    }
    async codeRiview(code: string) {

        // 分发 Agent
        const review = (state: typeof reviewState.State) => {
            const tasks = [
                {
                    aspect: '安全性',
                    prompt: `检查代码安全问题（SQL 注入、XSS、敏感信息泄露等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
                },
                {
                    aspect: '性能',
                    prompt: `检查代码性能问题（算法复杂度、N+1 查询、内存泄漏等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
                },
                {
                    aspect: '代码规范',
                    prompt: `检查代码规范（命名、注释、DRY 原则、错误处理等）。
输出 JSON（不要其他内容）：{"issues":["问题描述"],"score":7}`,
                },
            ]
            return tasks.map(t =>
                new Send('reviewAgent', {
                    code: state.code,
                    language: state.language,
                    aspect: t.aspect,
                    prompt: t.prompt,
                })
            )

        }



    }
}

