import { type CompletionResponseGenerator, CompletionStopReason } from '@sourcegraph/cody-shared'

import { addAutocompleteDebugEvent } from '../../services/open-telemetry/debug-utils'
import { canUsePartialCompletion } from '../can-use-partial-completion'
import type { DocumentContext } from '../get-current-doc-context'
import { getFirstLine } from '../text-processing'
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion'
import {
    type InlineCompletionItemWithAnalytics,
    processCompletion,
} from '../text-processing/process-inline-completions'

import { getDynamicMultilineDocContext } from './dynamic-multiline'
import { type HotStreakExtractor, createHotStreakExtractor } from './hot-streak'
import type { ProviderOptions } from './provider'

export interface FetchAndProcessCompletionsParams {
    abortController: AbortController
    completionResponseGenerator: CompletionResponseGenerator
    providerSpecificPostProcess: (insertText: string) => string
    providerOptions: Readonly<ProviderOptions>
}

/**
 * Uses the first line of the completion to figure out if it start the new multiline syntax node.
 * If it does, continues streaming until the completion is truncated or we reach the token sample limit.
 */
export async function* fetchAndProcessDynamicMultilineCompletions(
    params: FetchAndProcessCompletionsParams
): FetchCompletionsGenerator {
    const {
        completionResponseGenerator,
        abortController,
        providerOptions,
        providerSpecificPostProcess,
    } = params
    const { hotStreak, docContext, multiline, firstCompletionTimeout } = providerOptions

    let hotStreakExtractor: undefined | HotStreakExtractor

    interface StopParams {
        completedCompletion: InlineCompletionItemWithAnalytics
        rawCompletion: string
        isFullResponse: boolean
    }

    function* stopStreamingAndUsePartialResponse(
        stopParams: StopParams
    ): Generator<FetchCompletionResult> {
        const { completedCompletion, rawCompletion, isFullResponse } = stopParams
        addAutocompleteDebugEvent('stopStreamingAndUsePartialResponse', {
            isFullResponse,
            text: completedCompletion.insertText,
        })

        yield {
            docContext,
            completion: {
                ...completedCompletion,
                stopReason: isFullResponse ? completedCompletion.stopReason : 'streaming-truncation',
            },
        }

        // TODO(valery): disable hot-streak for long multiline completions?
        if (hotStreak) {
            hotStreakExtractor = createHotStreakExtractor({
                completedCompletion,
                ...params,
            })

            yield* hotStreakExtractor.extract(rawCompletion, isFullResponse)
        } else {
            abortController.abort()
        }
    }

    const generatorStartTime = performance.now()

    for await (const { completion, stopReason } of completionResponseGenerator) {
        const isFirstCompletionTimeoutElapsed =
            performance.now() - generatorStartTime >= firstCompletionTimeout
        const isFullResponse = stopReason !== CompletionStopReason.StreamingChunk
        const shouldYieldFirstCompletion = isFullResponse || isFirstCompletionTimeoutElapsed

        const extractCompletion = shouldYieldFirstCompletion
            ? parseAndTruncateCompletion
            : canUsePartialCompletion
        const rawCompletion = providerSpecificPostProcess(completion)

        if (!getFirstLine(rawCompletion) && !shouldYieldFirstCompletion) {
            continue
        }

        addAutocompleteDebugEvent(isFullResponse ? 'full_response' : 'incomplete_response', {
            multiline,
            currentLinePrefix: docContext.currentLinePrefix,
            text: rawCompletion,
        })

        if (hotStreakExtractor) {
            yield* hotStreakExtractor.extract(rawCompletion, isFullResponse)
            continue
        }

        /**
         * This completion was triggered with the multiline trigger at the end of current line.
         * Process it as the usual multiline completion: continue streaming until it's truncated.
         */
        if (multiline) {
            addAutocompleteDebugEvent('multiline_branch')
            const completion = extractCompletion(rawCompletion, {
                document: providerOptions.document,
                docContext,
                isDynamicMultilineCompletion: false,
            })

            if (completion) {
                const completedCompletion = processCompletion(completion, providerOptions)
                yield* stopStreamingAndUsePartialResponse({
                    completedCompletion,
                    isFullResponse,
                    rawCompletion,
                })
            }

            continue
        }

        /**
         * This completion was started without the multiline trigger at the end of current line.
         * Check if the the first completion line ends with the multiline trigger. If that's the case
         * continue streaming and pretend like this completion was multiline in the first place:
         *
         * 1. Update `docContext` with the `multilineTrigger` value.
         * 2. Set the cursor position to the multiline trigger.
         */
        const dynamicMultilineDocContext = {
            ...docContext,
            ...getDynamicMultilineDocContext({
                docContext,
                languageId: providerOptions.document.languageId,
                insertText: rawCompletion,
            }),
        }

        if (dynamicMultilineDocContext.multilineTrigger && !isFirstCompletionTimeoutElapsed) {
            const completion = extractCompletion(rawCompletion, {
                document: providerOptions.document,
                docContext: dynamicMultilineDocContext,
                isDynamicMultilineCompletion: true,
            })

            if (completion) {
                addAutocompleteDebugEvent('isMultilineBasedOnFirstLine_resolve', {
                    currentLinePrefix: dynamicMultilineDocContext.currentLinePrefix,
                    text: completion.insertText,
                })

                const completedCompletion = processCompletion(completion, {
                    document: providerOptions.document,
                    position: dynamicMultilineDocContext.position,
                    docContext: dynamicMultilineDocContext,
                })

                yield* stopStreamingAndUsePartialResponse({
                    completedCompletion,
                    isFullResponse,
                    rawCompletion,
                })
            }
        } else {
            /**
             * This completion was started without the multiline trigger at the end of current line
             * and the first generated line does not end with a multiline trigger.
             *
             * Process this completion as a singleline completion: cut-off after the first new line char.
             */
            const completion = extractCompletion(rawCompletion, {
                document: providerOptions.document,
                docContext,
                isDynamicMultilineCompletion: false,
            })

            if (completion) {
                const firstLine = getFirstLine(completion.insertText)

                addAutocompleteDebugEvent('singleline resolve', {
                    currentLinePrefix: docContext.currentLinePrefix,
                    text: firstLine,
                })

                const completedCompletion = processCompletion(
                    {
                        ...completion,
                        insertText: firstLine,
                    },
                    providerOptions
                )

                yield* stopStreamingAndUsePartialResponse({
                    isFullResponse,
                    completedCompletion,
                    rawCompletion,
                })
            }
        }
    }
}

export type FetchCompletionResult =
    | {
          docContext: DocumentContext
          completion: InlineCompletionItemWithAnalytics
      }
    | undefined

type FetchCompletionsGenerator = AsyncGenerator<FetchCompletionResult>

export async function* fetchAndProcessCompletions(
    params: FetchAndProcessCompletionsParams
): FetchCompletionsGenerator {
    const {
        completionResponseGenerator,
        abortController,
        providerOptions,
        providerSpecificPostProcess,
    } = params
    const { hotStreak, docContext } = providerOptions

    let hotStreakExtractor: undefined | HotStreakExtractor

    for await (const { stopReason, completion } of completionResponseGenerator) {
        addAutocompleteDebugEvent('fetchAndProcessCompletions', {
            stopReason,
            completion,
        })

        const isFullResponse = stopReason !== CompletionStopReason.StreamingChunk
        const rawCompletion = providerSpecificPostProcess(completion)

        if (hotStreakExtractor) {
            yield* hotStreakExtractor.extract(rawCompletion, isFullResponse)
            continue
        }

        const extractCompletion = isFullResponse ? parseAndTruncateCompletion : canUsePartialCompletion
        const parsedCompletion = extractCompletion(rawCompletion, {
            document: providerOptions.document,
            docContext,
            isDynamicMultilineCompletion: false,
        })

        if (parsedCompletion) {
            const completedCompletion = processCompletion(parsedCompletion, providerOptions)

            yield {
                docContext,
                completion: {
                    ...completedCompletion,
                    stopReason: isFullResponse ? stopReason : 'streaming-truncation',
                },
            }

            if (hotStreak) {
                hotStreakExtractor = createHotStreakExtractor({
                    completedCompletion,
                    ...params,
                })

                yield* hotStreakExtractor?.extract(rawCompletion, isFullResponse)
            } else {
                abortController.abort()
                break
            }
        }
    }
}
