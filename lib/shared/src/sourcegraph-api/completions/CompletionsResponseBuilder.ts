import type {
    CompletionContentData,
    CompletionFunctionCallsData,
    ThinkingContentPart,
    ToolCallContentPart,
} from './types'

/**
 * Helper to build the `completion` text from streaming LLM completions.
 *
 * - When api-version<=1, the `.completion` property always includes the full response
 * - When api-version>=2, the `.deltaText` property includes the incremental addition to the response
 */
export class CompletionsResponseBuilder {
    public totalCompletion = ''
    private readonly thinkingBuffer: string[] = []
    private readonly toolCalled = new Map<string, ToolCallContentPart>()
    private lastToolCallId?: string

    constructor(public readonly apiVersion: number) {}

    /**
     * Creates a builder from a URL with api-version parameter
     */
    public static fromUrl(url: string): CompletionsResponseBuilder {
        const apiVersion = Number.parseInt(new URL(url).searchParams.get('api-version') ?? '0', 10)
        return new CompletionsResponseBuilder(apiVersion)
    }

    /**
     * Processes the next chunk of completion text
     */
    public nextCompletion(completion: string | undefined, deltaText: string | undefined): string {
        if (this.apiVersion >= 2) {
            this.totalCompletion += deltaText || ''
        } else {
            this.totalCompletion = completion || ''
        }
        return this.totalCompletion
    }

    /**
     * Adds an incremental thinking step to the buffer
     */
    public nextThinking(deltaThinking?: string): ThinkingContentPart | undefined {
        if (deltaThinking) {
            this.thinkingBuffer.push(deltaThinking)
        }
        const thinking = this.thinkingBuffer.join('')
        if (!thinking) {
            return undefined
        }
        return {
            type: 'thinking',
            thinking,
        }
    }

    /**
     * Processes tool call data from the completion stream
     */
    public nextToolCalls(
        funcCalled: CompletionFunctionCallsData[] | undefined | null
    ): CompletionContentData[] {
        if (funcCalled) {
            for (const func of funcCalled) {
                this.processToolCall(func)
            }
        }
        return Array.from(this.toolCalled.values())
    }

    /**
     * Processes a single tool call and updates the internal state
     */
    private processToolCall(func: CompletionFunctionCallsData): void {
        const { id, function: fnData } = func || {}
        const args = fnData?.arguments || ''

        // Case 1: New or existing tool call with ID and name
        if (id && fnData?.name) {
            const existingTool = this.toolCalled.get(id)

            if (!existingTool) {
                // Create new tool call
                this.toolCalled.set(id, {
                    type: 'tool_call',
                    tool_call: {
                        id,
                        name: fnData.name,
                        arguments: args,
                    },
                })
            } else {
                // Update existing tool call arguments
                existingTool.tool_call.arguments =
                    ((existingTool.tool_call.arguments as string) || '') + args
            }
            this.lastToolCallId = id
        }
        // Case 2: Arguments without ID for the last tool call
        else if (this.lastToolCallId && args) {
            const lastTool = this.toolCalled.get(this.lastToolCallId)
            if (lastTool) {
                lastTool.tool_call.arguments = ((lastTool.tool_call.arguments as string) || '') + args
                this.toolCalled.set(this.lastToolCallId, lastTool)
            }
        }
    }
}
