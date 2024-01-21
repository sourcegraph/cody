import type { ChatParameters } from '../chat/chat'
import { dependentAbortController } from '../common/abortController'
import type { Message } from '../sourcegraph-api'
import type { CompletionGeneratorValue } from '../sourcegraph-api/completions/types'
import { createOllamaClient } from './ollama-client'

export async function* ollamaChat(
    messages: Message[],
    params: Partial<ChatParameters>,
    abortSignal?: AbortSignal
): AsyncGenerator<CompletionGeneratorValue> {
    const ollamaClient = createOllamaClient({ url: 'http://localhost:11434' })
    const stream = ollamaClient.complete(
        {
            model: params?.model?.replace('ollama/', '') ?? 'mixtral',
            prompt: messages.map(x => x.text).join(''),
            template: '{{.Prompt}}',
        },
        dependentAbortController(abortSignal)
    )
    try {
        for await (const resp of stream) {
            yield { type: 'change', text: resp.completion }
        }
        yield { type: 'complete' }
    } catch (error) {
        yield { type: 'error', error: error instanceof Error ? error : new Error(error as any) }
    }
}
