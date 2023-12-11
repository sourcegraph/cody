import { canUsePartialCompletion } from '../can-use-partial-completion'
import { DocumentContext, insertIntoDocContext } from '../get-current-doc-context'
import { parseAndTruncateCompletion } from '../text-processing/parse-and-truncate-completion'
import { InlineCompletionItemWithAnalytics, processCompletion } from '../text-processing/process-inline-completions'

import { getUpdatedDocContext } from './dynamic-multiline'
import { FetchAndProcessCompletionsParams } from './fetch-and-process-completions'

interface HotStreakExtractorParams extends FetchAndProcessCompletionsParams {
    completedCompletion: InlineCompletionItemWithAnalytics
}

export interface HotStreakExtractor {
    extract(rawCompletion: string, isRequestEnd: boolean): void
}

export function createHotStreakExtractor(params: HotStreakExtractorParams): HotStreakExtractor {
    const { completedCompletion, providerOptions, onHotStreakCompletionReady } = params
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

    function extract(rawCompletion: string, isRequestEnd: boolean): void {
        do {
            const unprocessedCompletion = rawCompletion.slice(alreadyInsertedLength)
            if (unprocessedCompletion.length === 0) {
                break
            }

            const updatedProviderOptions = {
                ...providerOptions,
                docContext: updatedDocContext,
            }

            const eventualDynamicMultilineProviderOptions = providerOptions.dynamicMultilineCompletions
                ? {
                      ...updatedProviderOptions,
                      docContext: getUpdatedDocContext({
                          ...params,
                          initialCompletion: unprocessedCompletion,
                          completionPostProcessId: '',
                      }),
                  }
                : updatedProviderOptions

            const completion = canUsePartialCompletion(unprocessedCompletion, eventualDynamicMultilineProviderOptions)
            if (completion) {
                // If the partial completion logic finds a match, extract this as the next hot
                // streak...
                const processedCompletion = processCompletion(completion, eventualDynamicMultilineProviderOptions)

                onHotStreakCompletionReady(updatedDocContext, {
                    ...processedCompletion,
                    stopReason: 'hot-streak',
                })

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
                    break
                }
                const processedCompletion = processCompletion(completion, eventualDynamicMultilineProviderOptions)
                onHotStreakCompletionReady(updatedDocContext, {
                    ...processedCompletion,
                    stopReason: 'hot-streak-end',
                })
                updatedDocContext = insertCompletionAndPressEnter(updatedDocContext, processedCompletion)
            } else {
                // ... otherwise we don't have enough in the remaining completion text to generate a full
                // hot-streak completion and yield to wait for the next chunk (or abort).
                break
            }
        } while (true)
    }

    return {
        extract,
    }
}
