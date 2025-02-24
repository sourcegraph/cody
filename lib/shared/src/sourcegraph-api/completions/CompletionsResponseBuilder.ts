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

    public static fromUrl(url: string): CompletionsResponseBuilder {
        const apiVersion = Number.parseInt(new URL(url).searchParams.get('api-version') ?? '0', 10)
        return new CompletionsResponseBuilder(apiVersion)
    }
}
