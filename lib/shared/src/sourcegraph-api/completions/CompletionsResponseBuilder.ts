import type { CompletionFunctionData } from './parse'
import type { ToolsCalled } from './types'

/**
 * Helper to build the `completion` text from streaming LLM completions.
 *
 * - When api-version<=1, the `.completion` property always includes the full response
 * - When api-version>=2, the `.deltaText` property includes the incremental addition to the response
 */
export class CompletionsResponseBuilder {
    public totalCompletion = ''
    constructor(public readonly apiVersion: number) {}
    public nextCompletion(completion: string | undefined, deltaText: string | undefined): string {
        const thinkingText = this.getThinkingText()
        if (this.apiVersion >= 2) {
            this.totalCompletion += deltaText ?? ''
        } else {
            this.totalCompletion = completion ?? ''
        }
        return thinkingText + this.totalCompletion
    }
    private readonly thinkingBuffer: string[] = []
    /**
     * Processes and accumulates thinking steps during the completion stream.
     * Thinking steps must start at the beginning of completion and are enclosed in <think> tags.
     * When the completion starts streaming, the previous <think> tag is closed.
     *
     * @param deltaThinking - The incremental thinking text to be added
     * @returns The formatted thinking text wrapped in XML tags
     */
    public nextThinking(deltaThinking?: string): string {
        if (deltaThinking) {
            this.thinkingBuffer.push(deltaThinking)
        }
        return this.getThinkingText()
    }
    /**
     * Generates the formatted thinking text by combining all thinking steps.
     * Wraps the combined thinking text in <think> tags and adds a newline if content exists.
     *
     * @returns Formatted thinking text with XML tags, or empty string if no thinking steps exist
     */
    private getThinkingText(): string {
        const thinking = this.thinkingBuffer.join('')
        return thinking ? `<think>${thinking}</think>\n` : ''
    }

    // private toolCalled: ToolsCalled[] = []
    private toolCalled: Map<string, ToolsCalled> = new Map()
    private lastToolCallId: string | undefined

    /**
     * Processes and accumulates tool call data during the completion stream.
     * Handles both new tool calls and updates to existing ones based on their IDs.
     *
     * @param toolCalls - Array of tool call data from the delta_tool_calls field
     * @returns The array of accumulated tool calls
     */
    public nextToolCalls(funcCalled?: CompletionFunctionData[]): ToolsCalled[] {
        if (!funcCalled || funcCalled?.length === 0) {
            return Array.from(this.toolCalled.values())
        }

        for (const func of funcCalled) {
            const id = func?.id
            const args = func?.function?.arguments || ''
            // If the tool call has a complete ID, name, and non-empty arguments
            if (id) {
                console.log(funcCalled)
                const existingTool = this.toolCalled.get(id)
                if (existingTool) {
                    // Update the existing tool call with any new information
                    existingTool.args = existingTool.args + func?.function?.arguments
                } else {
                    // Create a new tool call
                    const newToolCall: ToolsCalled = {
                        id: id,
                        name: func.function.name,
                        args: args,
                    }
                    this.toolCalled.set(id, newToolCall)
                }
                this.lastToolCallId = id
            } else if (this.lastToolCallId) {
                const lastTool = this.toolCalled.get(this.lastToolCallId)
                if (lastTool) {
                    lastTool.args = lastTool.args + func?.function?.arguments
                }
            }
        }

        return Array.from(this.toolCalled.values())
    }

    // /**
    //  * Helper method to merge tool arguments, handling both JSON and string formats
    //  */
    // private mergeToolArguments(existing: string, additional: string): string {
    //     // If either string is empty, return the other
    //     if (!existing) return additional
    //     if (!additional) return existing

    //     try {
    //         // Try to parse both as JSON objects
    //         const existingObj = JSON.parse(existing)

    //         try {
    //             const additionalObj = JSON.parse(additional)
    //             // Both are valid JSON, merge objects
    //             return JSON.stringify({ ...existingObj, ...additionalObj })
    //         } catch {
    //             // Additional is not a valid JSON object, just concatenate
    //             return existing + additional
    //         }
    //     } catch {
    //         // Existing is not valid JSON, just concatenate
    //         console.error('Invalid JSON in tool arguments:', existing)
    //         return ''
    //     }
    // }

    public static fromUrl(url: string): CompletionsResponseBuilder {
        const apiVersion = Number.parseInt(new URL(url).searchParams.get('api-version') ?? '0', 10)
        return new CompletionsResponseBuilder(apiVersion)
    }
}
