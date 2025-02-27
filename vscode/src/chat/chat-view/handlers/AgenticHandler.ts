import Anthropic from '@anthropic-ai/sdk'
import type { ContentBlock, MessageParam, Tool, ToolResultBlockParam } from '@anthropic-ai/sdk/resources'
import {
    CodyIDE,
    PromptString,
    Typewriter,
    clientCapabilities,
    isAbortErrorOrSocketHangUp,
    logDebug,
} from '@sourcegraph/cody-shared'
import type { z } from 'zod'
import zodToJsonSchema from 'zod-to-json-schema'
import { getOSArch } from '../../../os'
import { getUniqueContextItems } from '../../../prompt-builder/unique-context'
import { type AgentTool, AgentToolGroup } from '../../tools/AgentToolGroup'
import { getToolBlock } from '../../tools/schema'
import { convertContextItemToInlineMessage, getCurrentFileName } from '../../tools/utils'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

interface ToolCall {
    id: string
    name: string
    input: any
}

// Function to convert Zod schema to Anthropic-compatible InputSchema
export function zodToAnthropicSchema(schema: z.ZodObject<any>): Tool.InputSchema {
    return zodToJsonSchema(schema) as Tool.InputSchema
}

const defaultParams = {
    '3.5': { model: 'claude-3-5-sonnet-latest' },
    '3.7': {
        model: 'claude-3-7-sonnet-latest',
        thinking: {
            type: 'enabled',
            budget_tokens: 2000,
        },
    },
}

export class AgenticHandler extends ChatHandler implements AgentHandler {
    private static SYSTEM_PROMPT = ''
    protected turnCount = 0
    protected readonly MAX_TURN = 20
    private readonly anthropic
    protected tools: AgentTool[] = []
    private messages: MessageParam[] = []

    constructor(
        protected readonly modelId: string,
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        editor: ChatControllerOptions['editor'],
        protected readonly chatClient: ChatControllerOptions['chatClient'],
        apiKey: string
    ) {
        super(modelId, contextRetriever, editor, chatClient)
        this.anthropic = new Anthropic({ apiKey })
        this.modelId = modelId.includes('7-sonnet')
            ? 'claude-3-7-sonnet-latest'
            : 'claude-3-5-sonnet-latest'

        if (AgenticHandler.SYSTEM_PROMPT === '') {
            AgenticHandler.SYSTEM_PROMPT = getClaudeSystemPrompt()
        }
    }

    public async handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const { requestID, inputText, mentions, editorState, chatBuilder, signal, span } = req
        if (signal.aborted) return // Early abort check

        this.tools = await AgentToolGroup.getToolsByVersion(this.contextRetriever, span)

        const contextResult = await this.computeAgenticContext(
            requestID,
            { text: inputText, mentions },
            editorState,
            chatBuilder,
            delegate,
            signal
        )

        if (contextResult.error) delegate.postError(contextResult.error, 'transcript')
        if (signal.aborted) return // Abort check after context
        if (contextResult.contextItems) {
            const contextItems = getUniqueContextItems(contextResult.contextItems)
            chatBuilder.setLastMessageContext(contextItems)
            this.messages.push(
                {
                    role: 'user',
                    content: convertContextItemToInlineMessage(contextItems),
                },
                { role: 'assistant', content: 'Reviewed!' }
            )
        }

        delegate.postMessageInProgress({
            speaker: 'assistant',
            model: this.modelId,
        })

        const typewriter = new Typewriter({
            update: content =>
                delegate.postMessageInProgress({
                    speaker: 'assistant',
                    text: PromptString.unsafe_fromLLMResponse(content),
                    model: this.modelId,
                }),
            close: delegate.postDone,
            error: error => {
                delegate.postError(error, 'transcript')
                delegate.postDone()
                if (isAbortErrorOrSocketHangUp(error)) signal.throwIfAborted()
            },
        })

        const streamContent: string[] = []
        const postUpdate = () => typewriter.update(streamContent.join(''))

        const processContentBlock = (contentBlock: ContentBlock, toolCalls: ToolCall[]) => {
            if (signal.aborted) return true // Check abort signal within content block processing

            switch (contentBlock.type) {
                case 'thinking':
                    streamContent.push('</think>')
                    break
                case 'tool_use':
                    toolCalls.push({
                        id: contentBlock.id,
                        name: contentBlock.name,
                        input: contentBlock.input,
                    })
                    streamContent.push(getToolBlock(contentBlock))
                    break
            }
            return false // Continue processing
        }

        this.messages.push({ role: 'user', content: inputText.toString() })

        const streamProcessor = async (): Promise<ToolCall[]> => {
            const toolCalls: ToolCall[] = []
            return new Promise((resolve, reject) => {
                this.anthropic.messages
                    .stream(
                        {
                            tools: this.tools.map(tool => tool.spec),
                            max_tokens: 8000,
                            messages: this.messages,
                            system: AgenticHandler.SYSTEM_PROMPT,
                            stream: true,
                            ...(this.modelId.includes('3-7')
                                ? defaultParams['3.7']
                                : defaultParams['3.5']),
                        },
                        {
                            headers: {
                                'anthropic-dangerous-direct-browser-access': 'true',
                            },
                        }
                    )
                    .on('text', (textDelta, textSnapshot) => {
                        streamContent.push(textDelta)
                        postUpdate()
                    })
                    .on('thinking', thinking => {
                        // Keep thinking events if needed for UI
                        streamContent.push(thinking)
                        postUpdate()
                    })
                    .on('contentBlock', (contentBlock: ContentBlock) => {
                        if (processContentBlock(contentBlock, toolCalls)) return
                    })
                    .on('streamEvent', e => {
                        if (e.type === 'content_block_start' && e.content_block?.type === 'thinking') {
                            streamContent.push('<think>')
                        }
                        postUpdate()
                    })
                    .on('end', () => resolve(toolCalls))
                    .on('error', error => reject(error))
                    .on('abort', error => reject(error))
                    .on('finalMessage', ({ role, content }: MessageParam) => {
                        this.messages.push({ role, content })
                    })
            })
        }

        while (this.turnCount < this.MAX_TURN) {
            const currentToolCalls = await streamProcessor().catch(error => {
                if (!signal.aborted) throw new Error(`Stream processing failed: ${error}`) // Prevent double error posting on abort
                return []
            })
            // typewriter.close() // Close typewriter after each turn

            if (signal.aborted) return // Abort check after stream processing

            if (currentToolCalls.length === 0) break

            const toolResults: ToolResultBlockParam[] = []
            for (const toolCall of currentToolCalls) {
                const tool = this.tools.find(t => t.spec.name === toolCall.name)
                if (!tool) continue
                try {
                    const output = await tool.invoke(toolCall.input)
                    toolResults.push({ type: 'tool_result', tool_use_id: toolCall.id, content: output })
                } catch (error) {
                    logDebug('AgenticHandler', `Failed to invoke ${toolCall.name}`, { verbose: error })
                    toolResults.push({
                        type: 'tool_result',
                        tool_use_id: toolCall.id,
                        content: String(error),
                    }) // Ensure content is always string
                    // Treat stream error as no tool calls to avoid infinite loop, and allow graceful exit.
                    break
                }
            }

            this.messages.push({ role: 'user', content: toolResults })
            this.turnCount++
        }

        if (this.turnCount >= this.MAX_TURN) {
            console.warn('Max agent turns reached.') // Use warn for non-critical issue
        }
        typewriter.close() // Ensure typewriter is closed after max turns or normal exit.
    }
}

const system = `You are Cody, an AI coding assistant from Sourcegraph, specializing in working within existing codebases. Your primary goal is to assist users with various coding tasks by leveraging your knowledge and the tools at your disposal.
Your goal is to help the user with their coding tasks by using the tools available to you.
Always gather all the necessary context before starting to work on a task. For example, if you are generating a unit test or new code, make sure you understand the requirement, the naming conventions, frameworks and libraries used and aligned in the current codebase, and the environment and commands used to run and test the code etc. Always validate the new unit test at the end including running the code if possible for live feedback.
Review each question carefully and answer it with detailed, accurate information.
If you need more information, use one of the available tools or ask for clarification instead of making assumptions or lies.
For requests that involves editing code based on shared context, always uses the text_editor tool to include the updated and completed code without omitting code or leave comments for users to fill in. Do not use the text_editor to write new code unrelated to the shared context unless requested explicitly.
Always uses code blocks with the language ID and file name after the backticks in markdown format when explaining code. Example: \`\`\`{{languageId}}:{{fileName}}\n{{code with inline comments as explaination}}\n\`\`\`
Each code block must be complete and self-contained of a code snippet or full file.

<system_information>
1. OS version: {{USER_INFO_OS}}
2. IDE: {{USER_INFO_IDE}}
3. Name of file that the user is currently looking at: '{{USER_INFO_CURRENT_FILE}}' - use the file tool to fetch the content of this file if needed
</system_information>

Always show your planning process before executing any task. This will help ensure that you have a clear understanding of the requirements and that your approach aligns with the user's needs.

{{THINKING_INSTRUCTION}}

REMEMBER, always be helpful and proactive! Don't ask for permission to do something when you can do it!`

const THINKING_INSTRUCTION = `Begin by analyzing the user's input and gathering any necessary additional context. Then, present your plan in <think> tags before proceeding with the task. It's OK for this section to be quite long.`

function getClaudeSystemPrompt(isOldSonnet = false): string {
    return system
        .replace('{{USER_INFO_OS}}', getOSArch()?.platform || 'unknown')
        .replace('{{USER_INFO_CURRENT_FILE}}', getCurrentFileName() || 'unknown')
        .replace('{{USER_INFO_IDE}}', clientCapabilities().agentIDE || CodyIDE.VSCode)
        .replace('{{THINKING_INSTRUCTION}}', isOldSonnet ? THINKING_INSTRUCTION : '')
}
