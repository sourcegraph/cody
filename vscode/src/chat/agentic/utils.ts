import type { BotResponseMultiplexer, CompletionGeneratorValue } from '@sourcegraph/cody-shared'

export async function multiplexerStream(
    stream: AsyncIterable<CompletionGeneratorValue>,
    multiplexer: BotResponseMultiplexer,
    abortSignal?: AbortSignal
): Promise<void> {
    let responseText = ''
    for await (const message of stream) {
        if (abortSignal?.aborted) {
            multiplexer.notifyTurnComplete()
            break
        }
        switch (message.type) {
            case 'change':
                responseText = message.text
                await multiplexer.publish(responseText)
                break
            case 'complete':
            case 'error':
                await multiplexer.publish(responseText)
                await multiplexer.notifyTurnComplete()
                break
        }
    }
}
