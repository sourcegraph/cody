import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { range } from '../testutils/textDocument'

import * as CompletionAnalyticsLogger from './analytics-logger'
import { type InlineCompletionItemContext, getInlineContextItemToLog } from './analytics-logger'
import type { ContextSummary } from './context/context-mixer'
import { getCurrentDocContext } from './get-current-doc-context'
import { InlineCompletionsResultSource, TriggerKind } from './get-inline-completions'
import { initCompletionProviderConfig } from './get-inline-completions-tests/helpers'
import type { RequestParams } from './request-manager'
import { documentAndPosition } from './test-helpers'

const defaultArgs = {
    multiline: false,
    triggerKind: TriggerKind.Automatic,
    testFile: false,
    providerIdentifier: 'bfl',
    providerModel: 'blazing-fast-llm',
    languageId: 'typescript',
    stageTimings: {},
}

const defaultContextSummary = {
    strategy: 'none',
    duration: 0.1337,
    totalChars: 3,
    prefixChars: 0,
    suffixChars: 3,
    retrieverStats: {},
} satisfies ContextSummary

const { document, position } = documentAndPosition('const foo = █')
const defaultRequestParams: RequestParams = {
    document,
    position,
    docContext: getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 100,
    }),
    selectedCompletionInfo: undefined,
}

const completionItemId = 'completion-item-id' as CompletionAnalyticsLogger.CompletionItemID

describe('analytics-logger', () => {
    let recordSpy: MockInstance
    beforeEach(() => {
        initCompletionProviderConfig({})
        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')
    })
    afterEach(() => {
        CompletionAnalyticsLogger.reset_testOnly()
    })

    it('logs a suggestion life cycle', () => {
        const item = {
            id: completionItemId,
            insertText: 'foo',
            resolvedModel: 'blazing-fast-llm-resolved',
        }
        const id = CompletionAnalyticsLogger.create(defaultArgs)
        expect(typeof id).toBe('string')

        CompletionAnalyticsLogger.start(id)
        CompletionAnalyticsLogger.networkRequestStarted(id, defaultContextSummary)
        CompletionAnalyticsLogger.loaded({
            logId: id,
            requestParams: defaultRequestParams,
            completions: [item],
            source: InlineCompletionsResultSource.Network,
            isFuzzyMatch: false,
            isDotComUser: false,
        })
        const suggestionEvent = CompletionAnalyticsLogger.prepareSuggestionEvent({ id })
        suggestionEvent?.markAsRead({
            document,
            position,
        })
        CompletionAnalyticsLogger.accepted(id, document, item, range(0, 0, 0, 0), false)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion', 'suggested', {
            version: 0,
            interactionID: expect.any(String),
            metadata: expect.anything(),
            privateMetadata: expect.anything(),
            billingMetadata: expect.anything(),
        })

        expect(recordSpy).toHaveBeenCalledWith('cody.completion', 'accepted', {
            version: 0,
            interactionID: expect.any(String),
            metadata: expect.anything(),
            privateMetadata: expect.anything(),
            billingMetadata: expect.anything(),
        })
    })

    it('reuses the completion ID for the same completion', () => {
        const item = { id: completionItemId, insertText: 'foo' }

        const id1 = CompletionAnalyticsLogger.create(defaultArgs)
        CompletionAnalyticsLogger.start(id1)
        CompletionAnalyticsLogger.networkRequestStarted(id1, defaultContextSummary)
        CompletionAnalyticsLogger.loaded({
            logId: id1,
            requestParams: defaultRequestParams,
            completions: [item],
            source: InlineCompletionsResultSource.Network,
            isFuzzyMatch: false,
            isDotComUser: false,
        })
        const firstSuggestionEvent = CompletionAnalyticsLogger.prepareSuggestionEvent({ id: id1 })
        firstSuggestionEvent?.markAsRead({
            document,
            position,
        })

        const loggerItem = CompletionAnalyticsLogger.getCompletionEvent(id1)
        const completionId = loggerItem?.params.id
        expect(completionId).toBeDefined()

        const id2 = CompletionAnalyticsLogger.create(defaultArgs)
        CompletionAnalyticsLogger.start(id2)
        CompletionAnalyticsLogger.networkRequestStarted(id2, defaultContextSummary)
        CompletionAnalyticsLogger.loaded({
            logId: id2,
            requestParams: defaultRequestParams,
            completions: [item],
            source: InlineCompletionsResultSource.Cache,
            isFuzzyMatch: false,
            isDotComUser: false,
        })
        const secondSuggestionEvent = CompletionAnalyticsLogger.prepareSuggestionEvent({ id: id2 })
        secondSuggestionEvent?.markAsRead({
            document,
            position,
        })
        CompletionAnalyticsLogger.accepted(id2, document, item, range(0, 0, 0, 0), false)

        const loggerItem2 = CompletionAnalyticsLogger.getCompletionEvent(id2)
        expect(loggerItem2?.params.id).toBe(completionId)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion', 'suggested', expect.anything())

        expect(recordSpy).toHaveBeenCalledWith('cody.completion', 'suggested', expect.anything())

        expect(recordSpy).toHaveBeenCalledWith('cody.completion', 'suggested', expect.anything())

        // After accepting the completion, the ID won't be reused a third time
        const id3 = CompletionAnalyticsLogger.create(defaultArgs)
        CompletionAnalyticsLogger.start(id3)
        CompletionAnalyticsLogger.networkRequestStarted(id3, defaultContextSummary)
        CompletionAnalyticsLogger.loaded({
            logId: id3,
            requestParams: defaultRequestParams,
            completions: [item],
            source: InlineCompletionsResultSource.Cache,
            isFuzzyMatch: false,
            isDotComUser: false,
        })
        const thirdSuggestionEvent = CompletionAnalyticsLogger.prepareSuggestionEvent({ id: id3 })
        thirdSuggestionEvent?.markAsRead({
            document,
            position,
        })

        const loggerItem3 = CompletionAnalyticsLogger.getCompletionEvent(id3)
        expect(loggerItem3?.params.id).not.toBe(completionId)
    })

    it('does not log partial accept events if the length is not increasing', () => {
        const item = { insertText: 'export default class Agent' }

        const id = CompletionAnalyticsLogger.create(defaultArgs)
        CompletionAnalyticsLogger.start(id)
        CompletionAnalyticsLogger.partiallyAccept(id, item, 5, false)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion', 'partiallyAccepted', expect.anything())

        CompletionAnalyticsLogger.partiallyAccept(id, item, 10, false)

        expect(recordSpy).toHaveBeenCalledWith('cody.completion', 'partiallyAccepted', expect.anything())

        CompletionAnalyticsLogger.partiallyAccept(id, item, 5, false)
        CompletionAnalyticsLogger.partiallyAccept(id, item, 8, false)
    })

    describe('getInlineContextItemToLog', () => {
        it('filters context items based on payload size limit', () => {
            const inlineCompletionItemContext: InlineCompletionItemContext = {
                repoName: 'https://github.com/example/repo',
                commit: 'abc123',
                filePath: '/path/to/file.ts',
                prefix: 'const foo = ',
                suffix: ';',
                triggerLine: 10,
                triggerCharacter: 5,
                isRepoPublic: true,
                context: [
                    {
                        identifier: 'item1',
                        content: 'a'.repeat(500 * 1024),
                        startLine: 1,
                        endLine: 10,
                        filePath: '/path/to/file1.ts',
                    },
                    {
                        identifier: 'item2',
                        content: 'b'.repeat(300 * 1024),
                        startLine: 11,
                        endLine: 20,
                        filePath: '/path/to/file2.ts',
                    },
                    {
                        identifier: 'item3',
                        content: 'c'.repeat(300 * 1024),
                        startLine: 21,
                        endLine: 30,
                        filePath: '/path/to/file3.ts',
                    },
                ],
            }

            const result = getInlineContextItemToLog(inlineCompletionItemContext)

            expect(result).toBeDefined()
            expect(result?.prefix).toBe('const foo = ')
            expect(result?.suffix).toBe(';')
            expect(result?.context).toHaveLength(2)
            expect(result?.context?.[0].identifier).toBe('item1')
            expect(result?.context?.[1].identifier).toBe('item2')
            expect(result?.context?.[2]).toBeUndefined()
        })

        it('filters when the prefix and suffix is too long', () => {
            const inlineCompletionItemContext: InlineCompletionItemContext = {
                repoName: 'https://github.com/example/repo',
                commit: 'abc123',
                filePath: '/path/to/file.ts',
                prefix: 'a'.repeat(1024 * 1024),
                suffix: ';',
                triggerLine: 10,
                triggerCharacter: 5,
                isRepoPublic: true,
                context: [
                    {
                        identifier: 'item1',
                        content: 'a'.repeat(500 * 1024),
                        startLine: 1,
                        endLine: 10,
                        filePath: '/path/to/file1.ts',
                    },
                    {
                        identifier: 'item2',
                        content: 'b'.repeat(300 * 1024),
                        startLine: 11,
                        endLine: 20,
                        filePath: '/path/to/file2.ts',
                    },
                    {
                        identifier: 'item3',
                        content: 'c'.repeat(300 * 1024),
                        startLine: 21,
                        endLine: 30,
                        filePath: '/path/to/file3.ts',
                    },
                ],
            }

            const result = getInlineContextItemToLog(inlineCompletionItemContext)
            expect(result).toBeUndefined()
        })

        it('returns undefined for undefined input', () => {
            const result = getInlineContextItemToLog(undefined)
            expect(result).toBeUndefined()
        })
    })
})
