import * as uuid from 'uuid'
import { Position } from 'vscode'

import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { canUsePartialCompletion } from '../can-use-partial-completion'
import { CodeCompletionsClient, CodeCompletionsParams } from '../client'
import { DocumentContext, getDerivedDocContext } from '../get-current-doc-context'
import { completionPostProcessLogger } from '../post-process-logger'
import { getFirstLine } from '../text-processing'
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion'
import {
    getMatchingSuffixLength,
    InlineCompletionItemWithAnalytics,
    processCompletion,
} from '../text-processing/process-inline-completions'
import { forkSignal } from '../utils'

import { ProviderOptions } from './provider'

interface FetchAndProcessCompletionsParams {
    client: Pick<CodeCompletionsClient, 'complete'>
    requestParams: CodeCompletionsParams
    abortSignal: AbortSignal
    providerSpecificPostProcess: (insertText: string) => string
    providerOptions: Readonly<ProviderOptions>
    emitHotStreak: boolean

    onCompletionReady: (completions: InlineCompletionItemWithAnalytics) => void
    onHotStreakCompletionReady: (docContext: DocumentContext, completions: InlineCompletionItemWithAnalytics) => void
}

/**
 * Uses the first line of the completion to figure out if it start the new multiline syntax node.
 * If it does, continues streaming until the completion is truncated or we reach the token sample limit.
 */
export async function fetchAndProcessDynamicMultilineCompletions(
    params: FetchAndProcessCompletionsParams
): Promise<InlineCompletionItemWithAnalytics> {
    const { client, requestParams, abortSignal, providerOptions, providerSpecificPostProcess } = params
    const { multiline, docContext } = providerOptions

    // The Async executor is required to return the completion early if a partial result from SSE can be used.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        try {
            const abortController = forkSignal(abortSignal)

            function stopStreamingAndUsePartialResponse(completionItem: InlineCompletionItemWithAnalytics): void {
                resolve({ ...completionItem, stopReason: 'streaming-truncation' })
                abortController.abort()
            }

            const completionPostProcessId = uuid.v4()
            let responseChunkNumber = 0

            const result = await client.complete(
                requestParams,
                (incompleteResponse: CompletionResponse) => {
                    completionPostProcessLogger.flush()
                    responseChunkNumber += 1
                    completionPostProcessLogger.info({
                        completionPostProcessId,
                        stage: `start ${responseChunkNumber}`,
                    })

                    const initialCompletion = providerSpecificPostProcess(incompleteResponse.completion)

                    completionPostProcessLogger.info({
                        completionPostProcessId,
                        stage: 'incomplete response',
                        text: initialCompletion,
                        obj: {
                            multiline,
                        },
                    })

                    /**
                     * This completion was triggered with the multiline trigger at the end of current line.
                     * Process it as the usual multline completion: continue streaming until it's truncated.
                     */
                    if (multiline) {
                        completionPostProcessLogger.info({ completionPostProcessId, stage: 'multiline', text: '' })
                        const completion = canUsePartialCompletion(initialCompletion, {
                            document: providerOptions.document,
                            docContext: {
                                completionPostProcessId,
                                ...docContext,
                            },
                        })

                        if (completion) {
                            const processedCompletion = processCompletion(completion, providerOptions)
                            stopStreamingAndUsePartialResponse(processedCompletion)
                        }
                    } else {
                        /**
                         * This completion was started without the multline trigger at the end of current line.
                         * Check if the the first completion line ends with the multline trigger. If that's the case
                         * continue streaming and pretend like this completion was multiline in the first place:
                         *
                         * 1. Update `docContext` with the `multilineTrigger` value.
                         * 2. Set the cursor position to the multiline trigger.
                         */
                        const updatedDocContext = getUpdatedDocContext({
                            ...params,
                            initialCompletion,
                            completionPostProcessId,
                        })

                        if (updatedDocContext.multilineTrigger) {
                            const completion = canUsePartialCompletion(initialCompletion, {
                                document: providerOptions.document,
                                docContext: updatedDocContext,
                                isDynamicMultilineCompletion: true,
                            })

                            if (completion) {
                                completionPostProcessLogger.info({
                                    completionPostProcessId,
                                    stage: 'isMultilineBasedOnFirstLine resolve',
                                    text: completion.insertText,
                                })

                                const processedCompletion = processCompletion(
                                    {
                                        ...completion,
                                        insertText: completion.insertText,
                                    },
                                    {
                                        ...providerOptions,
                                        docContext: updatedDocContext,
                                    }
                                )
                                stopStreamingAndUsePartialResponse(processedCompletion)
                            }
                        } else {
                            /**
                             * This completion was started without the multline trigger at the end of current line
                             * and the first generated line does not end with a multiline trigger.
                             *
                             * Process this completion as a singleline completion: cut-off after the first new line char.
                             */
                            const completion = canUsePartialCompletion(initialCompletion, providerOptions)

                            if (completion) {
                                const firstLine = getFirstLine(completion.insertText)

                                completionPostProcessLogger.info({
                                    completionPostProcessId,
                                    stage: 'singleline resolve',
                                    text: firstLine,
                                })

                                const processedCompletion = processCompletion(
                                    {
                                        ...completion,
                                        insertText: firstLine,
                                    },
                                    providerOptions
                                )
                                stopStreamingAndUsePartialResponse(processedCompletion)
                            }
                        }
                    }
                },
                abortController.signal
            )

            if (abortController.signal.aborted) {
                return
            }

            /**
             * We were not able to use a partial streaming response as a completion and receive the full
             * compeltion text generated by the LLM.
             */
            const initialCompletion = providerSpecificPostProcess(result.completion)
            completionPostProcessLogger.info({
                completionPostProcessId,
                stage: 'full response',
                text: initialCompletion,
            })

            const updatedDocContext = getUpdatedDocContext({
                ...params,
                completionPostProcessId,
                initialCompletion,
            })

            const completion = parseAndTruncateCompletion(initialCompletion, {
                document: providerOptions.document,
                docContext: updatedDocContext,
            })

            completionPostProcessLogger.info({
                completionPostProcessId,
                stage: 'full response resolve',
                text: completion.insertText,
            })

            const processedCompletion = processCompletion(completion, {
                document: providerOptions.document,
                position: updatedDocContext.position,
                docContext: updatedDocContext,
            })
            resolve({ ...processedCompletion, stopReason: result.stopReason })
        } catch (error) {
            reject(error)
        }
    })
}

export async function fetchAndProcessCompletions(params: FetchAndProcessCompletionsParams): Promise<void> {
    const { client, requestParams, abortSignal, providerOptions, providerSpecificPostProcess } = params
    const { position, document, docContext } = providerOptions

    let inHotStreakMode = false
    let completeCompletion: undefined | InlineCompletionItemWithAnalytics

    let lastDocumentContext = docContext
    let lastHotStreakCompletion: InlineCompletionItemWithAnalytics
    let lastHotStreakLineOffset = 0

    // The Async executor is required to return the completion early if a partial result from SSE can be used.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        try {
            const abortController = forkSignal(abortSignal)
            const result = await client.complete(
                requestParams,
                (incompleteResponse: CompletionResponse) => {
                    const initialCompletion = providerSpecificPostProcess(incompleteResponse.completion)
                    const completion = canUsePartialCompletion(initialCompletion, providerOptions)

                    if (completion) {
                        const processedCompletion = processCompletion(completion, providerOptions)

                        if (!completeCompletion) {
                            completeCompletion = processedCompletion
                            lastHotStreakCompletion = completeCompletion
                            params.onCompletionReady({ ...processedCompletion, stopReason: 'streaming-truncation' })
                        }

                        if (params.emitHotStreak) {
                            inHotStreakMode = true
                        } else {
                            abortController.abort()
                        }

                        if (inHotStreakMode) {
                            const unprocessedLines = completion.insertText
                                .split('\n')
                                .slice(lastHotStreakLineOffset)
                                .join('\n')
                            const addition = unprocessedLines.slice(
                                lastHotStreakCompletion.insertText.length + lastDocumentContext.position.character
                            )
                            console.log({ unprocessedLines }, addition)

                            const lines = addition.split('\n')
                            console.log({ lines })
                            for (const [index, line] of lines.entries()) {
                                console.log({ lastHotStreakLineOffset, index })

                                // Ignore last line as it might not be finished yet
                                if (index === lines.length - 1 && !initialCompletion.endsWith('\n')) {
                                    continue
                                }

                                // Stop hot-streak when:
                                // - the next line starts a comment
                                // - the next line is empty
                                // - the next line is a repetition of the previous line
                                if (line.trim() === '') {
                                    break
                                }

                                const whitespace = line.match(/^([\t ])*/)?.[0] || ''
                                const completionWithoutWhitespace = line.slice(whitespace.length)

                                const prefix =
                                    lastDocumentContext.prefix + lastHotStreakCompletion.insertText + '\n' + whitespace

                                lastDocumentContext = getDerivedDocContext({
                                    languageId: document.languageId,
                                    position: new Position(
                                        position.line + index + lastHotStreakLineOffset,
                                        whitespace.length
                                    ),
                                    dynamicMultilineCompletions: false,
                                    documentDependentContext: {
                                        prefix,
                                        // Remove the characters that are being replaced by the completion
                                        // to reduce the chances of breaking the parse tree with redundant symbols.
                                        suffix: docContext.suffix,
                                        injectedPrefix: null,
                                    },
                                })

                                console.log(
                                    'Preparing a hot-streak for',
                                    lastDocumentContext.prefix,
                                    'insertion',
                                    completionWithoutWhitespace
                                )

                                lastHotStreakCompletion = {
                                    ...processedCompletion,
                                    insertText: completionWithoutWhitespace,
                                    stopReason: 'hot-streak',
                                }
                                lastHotStreakLineOffset++
                                params.onHotStreakCompletionReady(lastDocumentContext, lastHotStreakCompletion)
                            }
                        }
                    }
                },
                abortController.signal
            )

            const initialCompletion = providerSpecificPostProcess(result.completion)
            const completion = parseAndTruncateCompletion(initialCompletion, providerOptions)

            const processedCompletion = processCompletion(completion, providerOptions)

            if (!completeCompletion) {
                params.onCompletionReady({ ...processedCompletion, stopReason: result.stopReason })
            }

            resolve()
        } catch (error) {
            reject(error)
        }
    })
}

interface GetUpdatedDocumentContextParams extends FetchAndProcessCompletionsParams {
    completionPostProcessId: string
    initialCompletion: string
}

/**
 * 1. Generates the updated document context pretending like the first line of the completion is already in the document.
 * 2. If the updated document context has the multiline trigger, returns the updated document context.
 * 3. Otherwise, returns the initial document context.
 */
function getUpdatedDocContext(params: GetUpdatedDocumentContextParams): DocumentContext {
    const { completionPostProcessId, initialCompletion, providerOptions } = params
    const {
        position,
        document,
        docContext,
        docContext: { prefix, suffix, currentLineSuffix },
    } = providerOptions

    const firstLine = getFirstLine(initialCompletion)
    const matchingSuffixLength = getMatchingSuffixLength(firstLine, currentLineSuffix)
    const updatedPosition = position.translate(0, firstLine.length - 1)

    completionPostProcessLogger.info({
        completionPostProcessId,
        stage: 'getDerivedDocContext',
        text: initialCompletion,
    })

    const updatedDocContext = getDerivedDocContext({
        languageId: document.languageId,
        position: updatedPosition,
        dynamicMultilineCompletions: true,
        documentDependentContext: {
            prefix: prefix + firstLine,
            // Remove the characters that are being replaced by the completion
            // to reduce the chances of breaking the parse tree with redundant symbols.
            suffix: suffix.slice(matchingSuffixLength),
            injectedPrefix: null,
            completionPostProcessId,
        },
    })

    const isMultilineBasedOnFirstLine = Boolean(updatedDocContext.multilineTrigger)

    if (isMultilineBasedOnFirstLine) {
        completionPostProcessLogger.info({
            completionPostProcessId,
            stage: 'isMultilineBasedOnFirstLine',
            text: initialCompletion,
        })

        return {
            ...docContext,
            completionPostProcessId,
            multilineTrigger: updatedDocContext.multilineTrigger,
            multilineTriggerPosition: updatedDocContext.multilineTriggerPosition,
        }
    }

    return docContext
}

function nthIndex(str: string, pat: string, n: number): number {
    const L = str.length
    let i = -1
    while (n-- && i++ < L) {
        i = str.indexOf(pat, i)
        if (i < 0) {
            break
        }
    }
    return i
}
