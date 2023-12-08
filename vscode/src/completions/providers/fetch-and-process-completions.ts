import * as uuid from 'uuid'

import { CompletionResponse } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { canUsePartialCompletion } from '../can-use-partial-completion'
import { CodeCompletionsClient, CodeCompletionsParams } from '../client'
import { DocumentContext, getDerivedDocContext, insertIntoDocContext } from '../get-current-doc-context'
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
                         * This completion was started without the multiline trigger at the end of current line.
                         * Check if the the first completion line ends with the multiline trigger. If that's the case
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
    const {
        document: { languageId },
        docContext,
    } = providerOptions

    let completedCompletion: undefined | InlineCompletionItemWithAnalytics

    let updatedDocContext: undefined | DocumentContext
    let lastInsertedWhitespace: undefined | string
    let alreadyInsertedLength = 0

    function insertCompletionAndPressEnter(
        docContext: DocumentContext,
        completion: InlineCompletionItemWithAnalytics
    ): DocumentContext {
        // For a hot streak, we require the completion to be inserted followed by an enter key
        // Enter will usually insert a line break followed by the same indentation that the
        // current line has.
        let updatedDocContext = insertIntoDocContext(docContext, completion.insertText, languageId)
        lastInsertedWhitespace = '\n' + (updatedDocContext.currentLinePrefix.match(/^([\t ])*/)?.[0] || '')
        updatedDocContext = insertIntoDocContext(updatedDocContext, lastInsertedWhitespace, languageId)

        alreadyInsertedLength += completion.insertText.length + lastInsertedWhitespace.length

        return updatedDocContext
    }

    function extractHotStreakCompletions(rawCompletion: string, isRequestEnd: boolean): void {
        if (!completedCompletion) {
            throw new Error('Hot streak require a completion to be yielded first')
        }

        if (!updatedDocContext || !alreadyInsertedLength) {
            updatedDocContext = insertCompletionAndPressEnter(docContext, completedCompletion)
        }

        do {
            const unprocessedCompletion = rawCompletion.slice(alreadyInsertedLength)
            if (unprocessedCompletion.length <= 0) {
                break
            }

            const updatedProviderOptions = {
                ...providerOptions,
                docContext: updatedDocContext,
            }

            const completion = canUsePartialCompletion(unprocessedCompletion, updatedProviderOptions)
            if (completion) {
                // If the partial completion logic finds a match, extract this as the next hot streak
                const processedCompletion = processCompletion(completion, updatedProviderOptions)
                params.onHotStreakCompletionReady(updatedDocContext, {
                    ...processedCompletion,
                    stopReason: 'hot-streak',
                })

                updatedDocContext = insertCompletionAndPressEnter(updatedDocContext, processedCompletion)
            } else if (isRequestEnd) {
                // If not and we are at processing the last payload, we use the whole remainder for
                // the completion (this means we will parse the last line even when a \n is missing
                // at the end)
                const completion = parseAndTruncateCompletion(unprocessedCompletion, updatedProviderOptions)
                if (completion.insertText.trim().length <= 0) {
                    break
                }
                const processedCompletion = processCompletion(completion, updatedProviderOptions)
                params.onHotStreakCompletionReady(updatedDocContext, {
                    ...processedCompletion,
                    stopReason: 'hot-streak-end',
                })
                updatedDocContext = insertCompletionAndPressEnter(updatedDocContext, processedCompletion)
            } else {
                // If we don't have enough in the remaining completion text to generate a full
                // hot-streak completion so we yield.
                break
            }
        } while (true)
    }

    // The Async executor is required to return the completion early if a partial result from SSE can be used.
    // eslint-disable-next-line @typescript-eslint/no-misused-promises, no-async-promise-executor
    return new Promise(async (resolve, reject) => {
        try {
            const abortController = forkSignal(abortSignal)
            const result = await client.complete(
                requestParams,
                (incompleteResponse: CompletionResponse) => {
                    const rawCompletion = providerSpecificPostProcess(incompleteResponse.completion)

                    if (!completedCompletion) {
                        const completion = canUsePartialCompletion(rawCompletion, providerOptions)
                        if (completion) {
                            const processedCompletion = processCompletion(completion, providerOptions)
                            completedCompletion = processedCompletion
                            params.onCompletionReady({ ...processedCompletion, stopReason: 'streaming-truncation' })
                        } else {
                            // If we don't have a complete completion yet and th current chunk is
                            // not extracting one, we need to wait longer.
                            return
                        }
                    }

                    if (params.emitHotStreak) {
                        extractHotStreakCompletions(rawCompletion, false)
                    } else {
                        abortController.abort()
                    }
                },
                abortController.signal
            )

            const rawCompletion = providerSpecificPostProcess(result.completion)

            if (!completedCompletion) {
                const completion = parseAndTruncateCompletion(rawCompletion, providerOptions)
                const processedCompletion = processCompletion(completion, providerOptions)
                completedCompletion = processedCompletion
                params.onCompletionReady({ ...processedCompletion, stopReason: result.stopReason })
            }

            extractHotStreakCompletions(rawCompletion, true)

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
