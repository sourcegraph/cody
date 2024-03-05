import { CompletionStopReason } from '../inferenceClient/misc'
import { logDebug } from '../logger'
import type { CompletionLogger } from '../sourcegraph-api/completions/client'
import type {
    CompletionCallbacks,
    CompletionParameters,
    CompletionResponse,
} from '../sourcegraph-api/completions/types'
import { OLLAMA_DEFAULT_URL, type OllamaGenerateResponse } from './completions-client'

export function ollamaChatClient(
    params: CompletionParameters,
    cb: CompletionCallbacks,
    completionsEndpoint: string,
    logger?: CompletionLogger,
    signal?: AbortSignal
): void {
    const lastHumanMessage = params.messages[params.messages.length - 2]
    const stopReason = ''
    const ollamaparams = {
        ...params,
        stop_sequence: [stopReason],
        model: params?.model?.replace('ollama/', ''),
        prompt: lastHumanMessage.text,
        messages: params.messages.map(msg => {
            return {
                role: msg.speaker === 'human' ? 'user' : 'assistant',
                content: msg.text,
            }
        }),
    }
    const log = logger?.startCompletion(params, completionsEndpoint)

    fetch(new URL('/api/generate', OLLAMA_DEFAULT_URL).href, {
        method: 'POST',
        body: JSON.stringify(ollamaparams),
        headers: {
            'Content-Type': 'application/json',
        },
        signal,
    }).then(async response => {
        const reader = response?.body?.getReader() // Get the reader from the ReadableStream

        const textDecoderStream = new TransformStream({
            transform(chunk, controller) {
                const text = new TextDecoder().decode(chunk, { stream: true })
                controller.enqueue(text)
            },
        })

        const readableStream = new ReadableStream({
            start(controller) {
                const pump = () => {
                    reader?.read().then(({ done, value }) => {
                        if (done) {
                            controller.close()
                            return
                        }
                        controller.enqueue(value)
                        pump()
                    })
                }
                pump()
            },
        })

        const transformedStream = readableStream.pipeThrough(textDecoderStream)
        const readerForTransformedStream = transformedStream.getReader()

        let insertText = ''

        while (true) {
            const { done, value } = await readerForTransformedStream.read()
            if (done) {
                break
            }
            const lines = value.toString().split(/\r?\n/).filter(Boolean)
            for (const line of lines) {
                if (!line) {
                    continue
                }
                const parsedLine = JSON.parse(line) as OllamaGenerateResponse

                if (parsedLine.response) {
                    insertText += parsedLine.response
                    cb.onChange(insertText)
                }

                if (parsedLine.done && parsedLine.total_duration) {
                    logDebug?.('ollama', 'generation done', parsedLine)
                    cb.onComplete()
                }
            }
        }

        const completionResponse: CompletionResponse = {
            completion: insertText,
            stopReason: stopReason || CompletionStopReason.RequestFinished,
        }
        log?.onComplete(completionResponse)
    })
}
