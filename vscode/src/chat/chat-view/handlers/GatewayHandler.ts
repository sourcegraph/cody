import {
    CodyIDE,
    type Message,
    PromptString,
    type ToolsCalled,
    clientCapabilities,
    logDebug,
} from '@sourcegraph/cody-shared'
import type { z } from 'zod'
import { getOSArch } from '../../../os'
import { getUniqueContextItems } from '../../../prompt-builder/unique-context'
import { getCategorizedMentions } from '../../../prompt-builder/utils'
import { type AgentTool, AgentToolGroup } from '../../tools/AgentToolGroup'
import { convertContextItemToInlineMessage, getCurrentFileName } from '../../tools/utils'
import type { ChatControllerOptions } from '../ChatController'
import type { ContextRetriever } from '../ContextRetriever'
import { DefaultPrompter } from '../prompt'
import { ChatHandler } from './ChatHandler'
import type { AgentHandler, AgentHandlerDelegate, AgentRequest } from './interfaces'

// Function to convert Zod schema to JSON Schema
export function zodToJsonSchema(schema: z.ZodObject<any>): any {
    return zodToJsonSchema(schema)
}

// Gateway
export class GatewayHandler extends ChatHandler implements AgentHandler {
    public static SYSTEM_PROMPT = ''
    protected turnCount = 0
    protected readonly MAX_TURN = 20
    protected tools: AgentTool[] = []

    constructor(
        protected readonly modelId: string,
        contextRetriever: Pick<ContextRetriever, 'retrieveContext' | 'computeDidYouMean'>,
        editor: ChatControllerOptions['editor'],
        protected readonly chatClient: ChatControllerOptions['chatClient']
    ) {
        super(modelId, contextRetriever, editor, chatClient)

        if (!GatewayHandler.SYSTEM_PROMPT) {
            GatewayHandler.SYSTEM_PROMPT = getClaudeSystemPrompt(!modelId.includes('7-sonnet'))
        }
    }

    public async handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        try {
            await this._handle(req, delegate)
        } catch (error) {
            logDebug('AgenticGeminiHandler', 'Error in handle', { verbose: error })
            delegate.postDone()
        }
    }

    private async _handle(req: AgentRequest, delegate: AgentHandlerDelegate): Promise<void> {
        const { requestID, signal, inputText, mentions, span, editorState, chatBuilder, recorder } = req

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
        const contextItems = getUniqueContextItems(contextResult.contextItems || [])
        if (contextItems.length) {
            const groupedContext = convertContextItemToInlineMessage(contextItems)
            if (groupedContext.length) {
                chatBuilder.setLastMessageContext(contextItems)
            }
        }

        delegate.postMessageInProgress({
            speaker: 'assistant',
            model: this.modelId,
        })

        const system = GatewayHandler.SYSTEM_PROMPT

        const streamProcessor = async (): Promise<ToolsCalled[]> => {
            const toolCalls = new Map<string, ToolsCalled>()
            // Convert our tools to the format expected by Sourcegraph API
            const tools = this.tools.map(tool => ({
                type: 'function',
                function: {
                    name: tool.spec.name,
                    description: tool.spec.description,
                    parameters: tool.spec.input_schema,
                },
            }))

            // Create a new prompter for each turn
            const { explicitMentions, implicitMentions } = getCategorizedMentions(contextItems)
            const prompter = new DefaultPrompter(explicitMentions, implicitMentions, false)
            const { prompt } = await this.buildPrompt(prompter, chatBuilder, signal, 8)
            recorder.recordChatQuestionExecuted(contextItems, { addMetadata: true, current: span })

            // Prepare messages for the API call
            const params = {
                maxTokensToSample: 4000,
                messages: prompt,
                system,
                tools,
                stream: true,
                model: this.modelId,
            }

            const stream = await this.chatClient.chat(prompt, params, signal)

            logDebug('AgenticGeminiHandler', 'Request sent', { verbose: params })

            const streamContent = { text: `Turn ${this.turnCount + 1}` }
            for await (const message of stream) {
                switch (message.type) {
                    case 'change': {
                        streamContent.text = message.text
                        delegate.postMessageInProgress({
                            speaker: 'assistant',
                            text: PromptString.unsafe_fromLLMResponse(streamContent.text),
                            model: this.modelId,
                        })
                        // Process any tool calls that came with this message
                        if (message.content?.tools?.length) {
                            for (const toolCall of message.content.tools) {
                                // We need to track and combine partial tool calls
                                const existingCall = toolCalls.get(toolCall.id)
                                if (!existingCall) {
                                    streamContent.text += `\n\nCalling ${toolCall.name}\n\n`
                                }
                                // Update existing tool call arguments
                                toolCalls.set(toolCall.id, toolCall)
                                if (existingCall?.args !== toolCall?.args) {
                                    delegate.postMessageInProgress({
                                        speaker: 'assistant',
                                        text: PromptString.unsafe_fromLLMResponse(streamContent.text),
                                        model: this.modelId,
                                    })
                                    break
                                }
                            }
                        }
                        break
                    }
                    case 'complete':
                        break
                    case 'error':
                        logDebug('GatewayHandler', 'Error in streamModelResponse', {
                            verbose: message.error,
                        })
                        throw new Error(
                            message.error instanceof Error ? message.error.message : message.error
                        )
                }
            }

            const assistantAnswer = {
                speaker: 'assistant',
                text: PromptString.unsafe_fromLLMResponse(streamContent.text),
            } satisfies Message
            streamContent.text += `\n\nTurn ${this.turnCount + 1} has completed.\n\n`
            delegate.postMessageInProgress({
                ...assistantAnswer,
                model: this.modelId,
            })
            chatBuilder.addBotMessage(assistantAnswer, this.modelId)
            return Array.from(toolCalls.values())
        }

        if (this.turnCount >= this.MAX_TURN) {
            delegate.postError(
                new Error(
                    'The conversation has been ended due to reaching the maximum number of turns.'
                ),
                'transcript'
            )
        }

        while (this.turnCount < this.MAX_TURN) {
            const currentToolCalls = await streamProcessor().catch(error => {
                logDebug('AgenticGeminiHandler', 'Error in stream', { verbose: error })
                // Prevent double error posting on abort
                if (!signal.aborted) delegate.postError(error, 'transcript')
                // Treat stream error as no tool calls to avoid infinite loop, and allow graceful exit.
                return []
            })
            // Abort check before each turn
            signal.throwIfAborted()

            if (currentToolCalls.length === 0) break

            const toolResults: any[] = []
            for (const toolCall of currentToolCalls) {
                signal.throwIfAborted() // Abort check before each tool invocation
                const tool = this.tools.find(t => t.spec.name === toolCall.name)
                if (!tool) continue
                try {
                    // Parse the args if they're a string
                    const parsedArgs =
                        typeof toolCall.args === 'string' ? JSON.parse(toolCall.args) : toolCall.args
                    const output = await tool.invoke(parsedArgs)
                    toolResults.push({
                        type: 'tool_result',
                        id: toolCall.id,
                        content: output,
                    })
                } catch (error) {
                    logDebug('GatewayHandler', `Failed to invoke ${toolCall.name}`, {
                        verbose: error,
                    })
                    toolResults.push({
                        type: 'tool_result',
                        id: toolCall.id,
                        content: String(error),
                    })
                    break
                }
            }
            const text = JSON.stringify(toolResults) || 'No tool results'
            chatBuilder.addHumanMessage({
                text: PromptString.unsafe_fromLLMResponse(text),
                agent: 'deep-cody',
                model: this.modelId,
            })

            this.turnCount++
        }

        delegate.postDone() // Ensure connection is closed after max turns or normal exit.
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
