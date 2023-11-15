import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'

import { telemetryService } from '../services/telemetry'
import { range } from '../testutils/textDocument'

import { ContextSummary } from './context/context-mixer'
import { getCurrentDocContext } from './get-current-doc-context'
import { InlineCompletionsResultSource, TriggerKind } from './get-inline-completions'
import * as CompletionLogger from './logger'
import { RequestParams } from './request-manager'
import { documentAndPosition } from './test-helpers'

const defaultArgs = {
    multiline: false,
    triggerKind: TriggerKind.Automatic,
    providerIdentifier: 'bfl',
    providerModel: 'blazing-fast-llm',
    languageId: 'typescript',
}

const defaultContextSummary = {
    strategy: 'none',
    duration: 0.1337,
    totalChars: 3,
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

const completionItemId = 'completion-item-id' as CompletionLogger.CompletionItemID

describe('logger', () => {
    let logSpy: MockInstance
    beforeEach(() => {
        logSpy = vi.spyOn(telemetryService, 'log')
    })
    afterEach(() => {
        CompletionLogger.reset_testOnly()
    })

    it('logs a suggestion life cycle', () => {
        const item = { id: completionItemId, insertText: 'foo' }
        const id = CompletionLogger.create(defaultArgs)
        expect(typeof id).toBe('string')

        CompletionLogger.start(id)
        CompletionLogger.networkRequestStarted(id, defaultContextSummary)
        CompletionLogger.loaded(id, defaultRequestParams, [item], InlineCompletionsResultSource.Network)
        CompletionLogger.suggested(id, item)
        CompletionLogger.accepted(id, document, item, range(0, 0, 0, 0))

        const shared = {
            id: expect.any(String),
            languageId: 'typescript',
            lineCount: 1,
            source: 'Network',
            triggerKind: 'Automatic',
            type: 'inline',
            multiline: false,
            multilineMode: null,
            otherCompletionProviderEnabled: false,
            otherCompletionProviders: [],
            providerIdentifier: 'bfl',
            providerModel: 'blazing-fast-llm',
            charCount: 3,
            contextSummary: {
                retrieverStats: {},
                strategy: 'none',
                totalChars: 3,
                duration: 0.1337,
            },
            items: [
                {
                    charCount: 3,
                    lineCount: 1,
                    lineTruncatedCount: undefined,
                    nodeTypes: undefined,
                    parseErrorCount: undefined,
                    truncatedWith: undefined,
                },
            ],
        }

        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:suggested',
            {
                ...shared,
                accepted: true,
                completionsStartedSinceLastSuggestion: 1,
                displayDuration: expect.any(Number),
                read: true,
                latency: expect.any(Number),
            },
            { agent: true }
        )

        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:accepted',
            {
                ...shared,
                acceptedItem: {
                    charCount: 3,
                    lineCount: 1,
                    lineTruncatedCount: undefined,
                    nodeTypes: undefined,
                    parseErrorCount: undefined,
                    truncatedWith: undefined,
                },
            },
            { agent: true }
        )
    })

    it('reuses the completion ID for the same completion', () => {
        const item = { id: completionItemId, insertText: 'foo' }

        const id1 = CompletionLogger.create(defaultArgs)
        CompletionLogger.start(id1)
        CompletionLogger.networkRequestStarted(id1, defaultContextSummary)
        CompletionLogger.loaded(id1, defaultRequestParams, [item], InlineCompletionsResultSource.Network)
        CompletionLogger.suggested(id1, item)

        const loggerItem = CompletionLogger.getCompletionEvent(id1)
        const completionId = loggerItem?.params.id
        expect(completionId).toBeDefined()

        const id2 = CompletionLogger.create(defaultArgs)
        CompletionLogger.start(id2)
        CompletionLogger.networkRequestStarted(id2, defaultContextSummary)
        CompletionLogger.loaded(id2, defaultRequestParams, [item], InlineCompletionsResultSource.Cache)
        CompletionLogger.suggested(id2, item)
        CompletionLogger.accepted(id2, document, item, range(0, 0, 0, 0))

        const loggerItem2 = CompletionLogger.getCompletionEvent(id2)
        expect(loggerItem2?.params.id).toBe(completionId)

        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:suggested',
            expect.objectContaining({
                id: loggerItem?.params.id,
                source: 'Network',
            }),
            { agent: true }
        )

        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:suggested',
            expect.objectContaining({
                id: loggerItem?.params.id,
                source: 'Cache',
            }),
            { agent: true }
        )
        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:suggested',
            expect.objectContaining({
                id: loggerItem?.params.id,
            }),
            { agent: true }
        )

        // After accepting the completion, the ID won't be reused a third time
        const id3 = CompletionLogger.create(defaultArgs)
        CompletionLogger.start(id3)
        CompletionLogger.networkRequestStarted(id3, defaultContextSummary)
        CompletionLogger.loaded(id3, defaultRequestParams, [item], InlineCompletionsResultSource.Cache)
        CompletionLogger.suggested(id3, item)

        const loggerItem3 = CompletionLogger.getCompletionEvent(id3)
        expect(loggerItem3?.params.id).not.toBe(completionId)
    })

    it('does not log partial accept events if the length is not increasing', () => {
        const item = { insertText: 'export default class Agent' }

        const id = CompletionLogger.create(defaultArgs)
        CompletionLogger.start(id)
        CompletionLogger.partiallyAccept(id, item, 5)

        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:partiallyAccepted',
            expect.objectContaining({
                acceptedLength: 5,
                acceptedLengthDelta: 5,
            }),
            { agent: true }
        )

        CompletionLogger.partiallyAccept(id, item, 10)

        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:partiallyAccepted',
            expect.objectContaining({
                acceptedLength: 10,
                acceptedLengthDelta: 5,
            }),
            { agent: true }
        )

        CompletionLogger.partiallyAccept(id, item, 5)
        CompletionLogger.partiallyAccept(id, item, 8)
        expect(logSpy).toHaveBeenCalledTimes(2)
    })
})
