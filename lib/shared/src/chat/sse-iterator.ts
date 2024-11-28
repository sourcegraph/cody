interface SSEMessage {
    event: string
    data: string
}

const SSE_TERMINATOR = '\n\n'
export async function* createSSEIterator(
    iterator: ReadableStream,
    options: {
        // This is an optimizations to avoid unnecessary work when a streaming chunk contains more
        // than one completion event. Only use it when the completion repeats all generated tokens
        // and you can afford to loose some individual chunks.
        aggregatedCompletionEvent?: boolean
    } = {}
): AsyncGenerator<SSEMessage> {
    let buffer = ''
    const reader = iterator.getReader()

    try {
        while (true) {
            const { done, value } = await reader.read()
            if (done) break

            const messages: SSEMessage[] = []
            buffer += new TextDecoder().decode(value)

            let index: number
            // biome-ignore lint/suspicious/noAssignInExpressions: useful
            while ((index = buffer.indexOf(SSE_TERMINATOR)) >= 0) {
                const message = buffer.slice(0, index)
                buffer = buffer.slice(index + SSE_TERMINATOR.length)
                messages.push(parseSSEEvent(message))
            }

            for (let i = 0; i < messages.length; i++) {
                if (options.aggregatedCompletionEvent) {
                    if (
                        i + 1 < messages.length &&
                        messages[i].event === 'completion' &&
                        messages[i + 1].event === 'completion'
                    ) {
                        continue
                    }
                }

                yield messages[i]
            }
        }
    } finally {
        reader.releaseLock()
    }
}

function parseSSEEvent(message: string): SSEMessage {
    const headers = message.split('\n')

    let event = ''
    let data = ''
    for (const header of headers) {
        const index = header.indexOf(': ')
        const title = header.slice(0, index)
        const rest = header.slice(index + 2)
        switch (title) {
            case 'event':
                event = rest
                break
            case 'data':
                data = rest
                break
            default:
                console.error(`Unknown SSE event type: ${event}`)
        }
    }

    return { event, data }
}
