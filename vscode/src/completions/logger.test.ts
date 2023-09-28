import { afterEach, beforeEach, describe, expect, it, MockInstance, vi } from 'vitest'

import { telemetryService } from '../services/telemetry'

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

const { document, position } = documentAndPosition('const foo = █')
const defaultRequestParams: RequestParams = {
    document,
    position,
    docContext: getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 100,
        maxSuffixLength: 100,
        enableExtendedTriggers: true,
    }),
    selectedCompletionInfo: undefined,
}

describe('logger', () => {
    let logSpy: MockInstance
    beforeEach(() => {
        logSpy = vi.spyOn(telemetryService, 'log')
    })
    afterEach(() => {
        CompletionLogger.reset_testOnly()
    })

    it('logs a suggestion life cycle', () => {
        const item = { insertText: 'foo' }
        const id = CompletionLogger.create(defaultArgs)
        expect(typeof id).toBe('string')

        CompletionLogger.start(id)
        CompletionLogger.networkRequestStarted(id, { duration: 0.1337 })
        CompletionLogger.loaded(id, defaultRequestParams, [item])
        CompletionLogger.suggested(id, InlineCompletionsResultSource.Network, item)
        CompletionLogger.accept(id, item)

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
            providerIdentifier: 'bfl',
            providerModel: 'blazing-fast-llm',
            charCount: 3,
            contextSummary: {
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

        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:suggested', {
            ...shared,
            accepted: true,
            completionsStartedSinceLastSuggestion: 1,
            displayDuration: expect.any(Number),
            read: true,
            latency: expect.any(Number),
        })

        expect(logSpy).toHaveBeenCalledWith('CodyVSCodeExtension:completion:accepted', {
            ...shared,
            acceptedItem: {
                charCount: 3,
                lineCount: 1,
                lineTruncatedCount: undefined,
                nodeTypes: undefined,
                parseErrorCount: undefined,
                truncatedWith: undefined,
            },
        })
    })

    it('reuses the completion ID for the same completion', () => {
        const item = { insertText: 'foo' }

        const id1 = CompletionLogger.create(defaultArgs)
        CompletionLogger.start(id1)
        CompletionLogger.networkRequestStarted(id1, { duration: 0 })
        CompletionLogger.loaded(id1, defaultRequestParams, [item])
        CompletionLogger.suggested(id1, InlineCompletionsResultSource.Network, item)

        const loggerItem = CompletionLogger.getCompletionEvent(id1)
        const completionId = loggerItem?.params.id
        expect(completionId).toBeDefined()

        const id2 = CompletionLogger.create(defaultArgs)
        CompletionLogger.start(id2)
        CompletionLogger.networkRequestStarted(id2, { duration: 0 })
        CompletionLogger.loaded(id2, defaultRequestParams, [item])
        CompletionLogger.suggested(id2, InlineCompletionsResultSource.Cache, item)
        CompletionLogger.accept(id2, item)

        const loggerItem2 = CompletionLogger.getCompletionEvent(id2)
        expect(loggerItem2?.params.id).toBe(completionId)

        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:suggested',
            expect.objectContaining({
                id: loggerItem?.params.id,
                source: 'Network',
            })
        )

        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:suggested',
            expect.objectContaining({
                id: loggerItem?.params.id,
                source: 'Cache',
            })
        )
        expect(logSpy).toHaveBeenCalledWith(
            'CodyVSCodeExtension:completion:suggested',
            expect.objectContaining({
                id: loggerItem?.params.id,
            })
        )

        // After accepting the completion, the ID won't be reused a third time
        const id3 = CompletionLogger.create(defaultArgs)
        CompletionLogger.start(id3)
        CompletionLogger.networkRequestStarted(id3, { duration: 0 })
        CompletionLogger.loaded(id3, defaultRequestParams, [item])
        CompletionLogger.suggested(id3, InlineCompletionsResultSource.Cache, item)

        const loggerItem3 = CompletionLogger.getCompletionEvent(id3)
        expect(loggerItem3?.params.id).not.toBe(completionId)
    })
})
