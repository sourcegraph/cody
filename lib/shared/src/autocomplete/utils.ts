import * as anthropic from '@anthropic-ai/sdk'

import { Message } from '@sourcegraph/cody-shared/src/sourcegraph-api'
import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

export function messagesToText(messages: Message[]): string {
    return messages
        .map(
            message =>
                `${message.speaker === 'human' ? anthropic.HUMAN_PROMPT : anthropic.AI_PROMPT}${
                    message.text === undefined ? '' : ' ' + message.text
                }`
        )
        .join('')
}

/**
 * The size of the Jaccard distance match window in number of lines. It determines how many
 * lines of the 'matchText' are considered at once when searching for a segment
 * that is most similar to the 'targetText'. In essence, it sets the maximum number
 * of lines that the best match can be. A larger 'windowSize' means larger potential matches
 */
export const SNIPPET_WINDOW_SIZE = 50

export function lastNLines(text: string, n: number): string {
    const lines = text.split('\n')
    return lines.slice(Math.max(0, lines.length - n)).join('\n')
}

export async function batchCompletions(
    client: Pick<SourcegraphCompletionsClient, 'complete'>,
    params: CompletionParameters,
    n: number,
    abortSignal: AbortSignal
): Promise<CompletionResponse[]> {
    const responses: Promise<CompletionResponse>[] = []
    for (let i = 0; i < n; i++) {
        responses.push(client.complete(params, abortSignal))
    }
    return Promise.all(responses)
}

export function isAbortError(error: Error): boolean {
    return (
        // http module
        error.message === 'aborted' ||
        // fetch
        error.message.includes('The operation was aborted') ||
        error.message.includes('The user aborted a request')
    )
}
