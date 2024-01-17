import { canUsePartialCompletion } from '../can-use-partial-completion'
import { insertIntoDocContext, type DocumentContext } from '../get-current-doc-context'
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion'
import {
    processCompletion,
    type InlineCompletionItemWithAnalytics,
} from '../text-processing/process-inline-completions'

import { getDynamicMultilineDocContext } from './dynamic-multiline'
import { type FetchAndProcessCompletionsParams, type FetchCompletionResult } from './fetch-and-process-completions'

interface HotStreakExtractorParams extends FetchAndProcessCompletionsParams {
    completedCompletion: InlineCompletionItemWithAnalytics
}

export const STOP_REASON_HOT_STREAK = 'cody-hot-streak'

export interface HotStreakExtractor {
    extract(rawCompletion: string, isRequestEnd: boolean): Generator<FetchCompletionResult>
}

export function createHotStreakExtractor(params: HotStreakExtractorParams): HotStreakExtractor {
    const { completedCompletion, providerOptions } = params
    const {
        docContext,
        document: { languageId },
    } = providerOptions
    let lastInsertedWhitespace: undefined | string
    let alreadyInsertedLength = 0
    let updatedDocContext = insertCompletionAndPressEnter(docContext, completedCompletion)

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

    function* extract(rawCompletion: string, isRequestEnd: boolean): Generator<FetchCompletionResult> {
        while (true) {
            const unprocessedCompletion = rawCompletion.slice(alreadyInsertedLength)
            if (unprocessedCompletion.length === 0) {
                return undefined
            }

            const updatedProviderOptions = {
                ...providerOptions,
                docContext: updatedDocContext,
            }

            const eventualDynamicMultilineProviderOptions = providerOptions.dynamicMultilineCompletions
                ? {
                      ...updatedProviderOptions,
                      docContext: getDynamicMultilineDocContext({
                          ...params,
                          initialCompletion: unprocessedCompletion,
                      }),
                  }
                : updatedProviderOptions

            const completion = canUsePartialCompletion(unprocessedCompletion, eventualDynamicMultilineProviderOptions)
            if (completion) {
                // If the partial completion logic finds a match, extract this as the next hot
                // streak...
                const processedCompletion = processCompletion(completion, eventualDynamicMultilineProviderOptions)

                yield {
                    docContext: updatedDocContext,
                    completion: {
                        ...processedCompletion,
                        stopReason: STOP_REASON_HOT_STREAK,
                    },
                }

                updatedDocContext = insertCompletionAndPressEnter(updatedDocContext, processedCompletion)
            } else if (isRequestEnd) {
                // ... if not and we are processing the last payload, we use the whole remainder for the
                // completion (this means we will parse the last line even when a \n is missing at
                // the end) ...
                const completion = parseAndTruncateCompletion(
                    unprocessedCompletion,
                    eventualDynamicMultilineProviderOptions
                )
                if (completion.insertText.trim().length === 0) {
                    return undefined
                }
                const processedCompletion = processCompletion(completion, eventualDynamicMultilineProviderOptions)

                yield {
                    docContext: updatedDocContext,
                    completion: {
                        ...processedCompletion,
                        stopReason: STOP_REASON_HOT_STREAK,
                    },
                }

                updatedDocContext = insertCompletionAndPressEnter(updatedDocContext, processedCompletion)
            } else {
                // ... otherwise we don't have enough in the remaining completion text to generate a full
                // hot-streak completion and yield to wait for the next chunk (or abort).
                return undefined
            }
        }
    }

    return {
        extract,
    }
}
