import { PromptString, ps } from '@sourcegraph/cody-shared'
import type { Message } from '@sourcegraph/cody-shared'
import type { ChatClient } from '@sourcegraph/cody-shared'
import type { BotResponseMultiplexer } from '@sourcegraph/cody-shared'

/**
 * Handles building and managing raw text returned by LLM with support for:
 * - Incremental string building
 * - XML-style tag content extraction
 * - Length tracking
 * - String joining with custom connectors
 */
export class RawTextProcessor {
    private parts: string[] = []

    public append(str: string): string {
        this.parts.push(str)
        return this.parts.join('')
    }

    // Destructive read that clears state
    public consumeAndClear(): string {
        const joined = this.parts.join('')
        this.reset()
        return joined
    }

    public get length(): number {
        return this.parts.reduce((acc, part) => acc + part.length, 0)
    }

    private reset(): void {
        this.parts = []
    }

    public static extract(response: string, tag: string): string[] {
        const tagLength = tag.length
        return (
            response
                .match(new RegExp(`<${tag}>(.*?)<\/${tag}>`, 'gs'))
                ?.map(m => m.slice(tagLength + 2, -(tagLength + 3))) || []
        )
    }

    public static join(prompts: PromptString[], connector = ps`\n`) {
        return PromptString.join(prompts, connector)
    }
}

export class StreamProcessor {
    constructor(
        private readonly chatClient: Pick<ChatClient, 'chat'>,
        private readonly multiplexer: BotResponseMultiplexer
    ) {}

    public async start(
        requestID: string,
        message: Message[],
        signal?: AbortSignal,
        model?: string
    ): Promise<string> {
        const stream = await this.chatClient.chat(
            message,
            { model, maxTokensToSample: 4000 },
            new AbortController().signal,
            requestID
        )
        const accumulated = new RawTextProcessor()
        try {
            for await (const msg of stream) {
                if (signal?.aborted) break
                if (msg.type === 'change') {
                    const newText = msg.text.slice(accumulated.length)
                    accumulated.append(newText)
                    await this.multiplexer.publish(newText ?? '')
                }

                if (msg.type === 'complete' || msg.type === 'error') {
                    if (msg.type === 'error') throw new Error('Error while streaming')
                    break
                }
            }
        } catch (error) {
            console.error(error)
        }
        await this.multiplexer.notifyTurnComplete()
        return accumulated.consumeAndClear()
    }
}
