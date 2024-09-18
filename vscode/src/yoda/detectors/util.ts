import type { CompletionGeneratorValue } from '@sourcegraph/cody-shared'

export function reversedTuple<T extends readonly unknown[]>(tuple: T): T {
    return [...tuple].reverse() as unknown as T
}

export async function combineStream(
    stream: AsyncGenerator<CompletionGeneratorValue>,
    abort?: AbortSignal
) {
    let response = ''
    for await (const message of stream) {
        if (abort?.aborted) {
            return null
        }
        switch (message.type) {
            case 'change':
                response = message.text
                break
            case 'error':
                throw message.error
        }
    }
    if (!response) {
        return null
    }
    return response
}
