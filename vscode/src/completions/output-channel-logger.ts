import escapeRegExp from 'lodash/escapeRegExp'
import * as uuid from 'uuid'
import * as vscode from 'vscode'

import type {
    CompletionLogger as CompletionLoggerInterface,
    CompletionParameters,
    CompletionResponse,
    Event,
    FireworksCodeCompletionParams,
    SerializedCodeCompletionsParams,
} from '@sourcegraph/cody-shared'

import { Logger } from '../output-channel-logger'

export const autocompleteOutputChannelLogger = new Logger('Autocomplete')

export const autocompleteLifecycleOutputChannelLogger = {
    startCompletion(params: CompletionParameters | Record<string, never>, endpoint: string) {
        // TODO: Use `CompletionLogID` here to allow attributing all output channel
        // logs to a specific completion.
        const outputChannelId = uuid.v4()
        const start = Date.now()

        // Internal setting for logging full autocomplete prompt to the output channel.
        const shouldLogFullPrompt = vscode.workspace
            .getConfiguration()
            .get<boolean>('cody.autocomplete.logFullPrompt', false)

        let hasFinished = false
        let lastCompletion = ''

        function onError(err: string, rawError?: unknown): void {
            if (hasFinished) {
                return
            }
            hasFinished = true
            const duration = Date.now() - start

            if (process.env.NODE_ENV === 'development' && rawError) {
                console.error(rawError)
            }

            autocompleteOutputChannelLogger.logError(
                'onError',
                `duration:"${duration}ms" endpoint:"${endpoint}" outputChannelId:"${outputChannelId}"`,
                JSON.stringify({
                    outputChannelId,
                    duration: Date.now() - start,
                    err,
                }),
                { verbose: { params } }
            )
        }

        function onComplete({ completion, stopReason }: CompletionResponse): void {
            if (hasFinished) {
                return
            }
            hasFinished = true
            const duration = Date.now() - start

            autocompleteOutputChannelLogger.logDebug(
                'onComplete',
                `duration:"${duration}ms" stopReason:"${stopReason}" outputChannelId:"${outputChannelId}"`,
                { verbose: { completion } }
            )
        }

        function onEvents(events: Event[]): void {
            for (const event of events) {
                switch (event.type) {
                    case 'completion':
                        lastCompletion = event.completion
                        break
                    case 'error':
                        onError(event.error)
                        break
                    case 'done':
                        onComplete({ completion: lastCompletion })
                        break
                }
            }
        }

        return {
            onFetch(
                httpClientLabel: string,
                body: SerializedCodeCompletionsParams | FireworksCodeCompletionParams
            ) {
                const bodyToLog: any = { ...body }
                const { stopSequences = [] } = params as unknown as CompletionParameters

                if (!shouldLogFullPrompt) {
                    if ('messages' in body) {
                        bodyToLog.messages = body.messages.map(message => {
                            return message.text
                                ? shortenPromptForOutputChannel(message.text, stopSequences)
                                : message
                        })
                    }

                    if ('prompt' in body) {
                        bodyToLog.prompt = shortenPromptForOutputChannel(body.prompt, stopSequences)
                    }
                }

                autocompleteOutputChannelLogger.logDebug(
                    `${httpClientLabel}:fetch`,
                    `endpoint: "${endpoint}" outputChannelId: "${outputChannelId}"`,
                    { verbose: bodyToLog }
                )
            },
            onError,
            onComplete,
            onEvents,
        }
    },
} satisfies CompletionLoggerInterface

// Maximum length of a segment before it gets compacted
const MAX_SEGMENT_LENGTH = 200

function shortenPromptForOutputChannel(prompt: string, stopSequences: string[]): string {
    const stopSequencesWithoutNewLines = stopSequences.filter(seq => !isNewlineSequence(seq))
    const escapedSeparators = stopSequencesWithoutNewLines.map(escapeRegExp)

    // If no separators remain after filtering, compact the whole prompt
    if (escapedSeparators.length === 0) {
        return compactSegment(prompt, MAX_SEGMENT_LENGTH)
    }

    const splitParts = prompt.split(new RegExp(`(${escapedSeparators.join('|')})`, 'g'))

    const compactedParts = splitParts.map((part, index) => {
        if (index % 2 === 0) {
            // Text part
            return compactSegment(part, MAX_SEGMENT_LENGTH)
        }
        // Separator part
        return part
    })

    return compactedParts.join('')
}

function compactSegment(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
        return text
    }

    const placeholder = `[...${text.length - maxLength} characters]`
    const halfLength = Math.floor((maxLength - placeholder.length) / 2)

    if (halfLength <= 0) {
        return text
    }

    const startText = text.substring(0, halfLength)
    const endText = text.substring(text.length - halfLength)

    return `${startText}${placeholder}${endText}`
}

function isNewlineSequence(s: string): boolean {
    return /^[\n\r]+$/.test(s)
}
