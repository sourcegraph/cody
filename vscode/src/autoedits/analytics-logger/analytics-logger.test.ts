import omit from 'lodash/omit'
import * as uuid from 'uuid'
import { type MockInstance, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'

import {
    isWindows,
    mockAuthStatus,
    ps,
    setDisplayPathEnvInfo,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import { getCurrentDocContext } from '../../completions/get-current-doc-context'
import { documentAndPosition } from '../../completions/test-helpers'
import * as sentryModule from '../../services/sentry/sentry'
import type { AutoeditModelOptions } from '../adapters/base'
import { getCurrentFilePromptComponents } from '../prompt/prompt-utils'
import { getDecorationInfo } from '../renderer/diff-utils'

import {
    AutoeditAnalyticsLogger,
    type AutoeditRequestID,
    autoeditDiscardReason,
    autoeditSource,
    autoeditTriggerKind,
} from './analytics-logger'

describe('AutoeditAnalyticsLogger', () => {
    let autoeditLogger: AutoeditAnalyticsLogger
    let recordSpy: MockInstance
    let stableIdCounter = 0

    setDisplayPathEnvInfo({
        isWindows: isWindows(),
        workspaceFolders: [],
    })

    const { document, position } = documentAndPosition('█', 'typescript', 'file:///fake-file.ts')
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
    })

    const { codeToReplaceData } = getCurrentFilePromptComponents({
        docContext,
        position,
        document,
        tokenBudget: {
            maxPrefixLinesInArea: 2,
            maxSuffixLinesInArea: 2,
            codeToRewritePrefixLines: 1,
            codeToRewriteSuffixLines: 1,
        },
    })

    const modelOptions: AutoeditModelOptions = {
        url: 'https://test-url.com/',
        model: 'autoedit-model',
        prompt: {
            systemMessage: ps`This is test message`,
            userMessage: ps`This is test prompt text`,
        },
        codeToRewrite: 'This is test code to rewrite',
        userId: 'test-user-id',
        isChatModel: false,
    }

    function getRequestStartMetadata(): Parameters<AutoeditAnalyticsLogger['createRequest']>[0] {
        return {
            startedAt: performance.now(),
            docContext,
            document,
            position,
            codeToReplaceData,
            payload: {
                languageId: 'typescript',
                model: 'autoedit-model',
                triggerKind: autoeditTriggerKind.automatic,
                codeToRewrite: 'Code to rewrite',
            },
        }
    }

    function createAndAdvanceRequest({
        finalPhase,
        prediction,
    }: { finalPhase: 'suggested' | 'accepted' | 'rejected'; prediction: string }): AutoeditRequestID {
        const requestId = autoeditLogger.createRequest(getRequestStartMetadata())

        autoeditLogger.markAsContextLoaded({
            requestId,
            payload: {
                contextSummary: {
                    strategy: 'none',
                    duration: 1.234,
                    totalChars: 10,
                    prefixChars: 5,
                    suffixChars: 5,
                    retrieverStats: {},
                },
            },
        })

        // Stabilize latency for tests
        vi.advanceTimersByTime(300)

        autoeditLogger.markAsLoaded({
            requestId,
            prompt: modelOptions.prompt,
            payload: {
                prediction,
                source: autoeditSource.network,
                isFuzzyMatch: false,
                responseHeaders: {},
            },
        })

        autoeditLogger.markAsPostProcessed({
            requestId,
            prediction,
            inlineCompletionItems: [],
            decorationInfo: getDecorationInfo(prediction, prediction),
        })
        autoeditLogger.markAsSuggested(requestId)

        if (finalPhase === 'accepted') {
            autoeditLogger.markAsAccepted(requestId)
        }

        if (finalPhase === 'rejected') {
            autoeditLogger.markAsRejected(requestId)
        }

        return requestId
    }

    beforeAll(() => {
        vi.useFakeTimers()
        mockAuthStatus()
    })

    beforeEach(() => {
        autoeditLogger = new AutoeditAnalyticsLogger()
        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')

        stableIdCounter = 0
        vi.spyOn(uuid, 'v4').mockImplementation(() => `stable-id-for-tests-${++stableIdCounter}`)
    })

    afterEach(() => {
        vi.resetAllMocks()
        vi.clearAllTimers()
    })

    it('logs a suggestion lifecycle (started -> contextLoaded -> loaded -> suggested -> accepted)', () => {
        const prediction = 'say("Hello from autoedit!")'
        const requestId = createAndAdvanceRequest({
            finalPhase: 'accepted',
            prediction,
        })

        // Invalid transition attempt
        autoeditLogger.markAsAccepted(requestId)

        expect(recordSpy).toHaveBeenCalledTimes(3)
        expect(recordSpy).toHaveBeenNthCalledWith(1, 'cody.autoedit', 'suggested', expect.any(Object))
        expect(recordSpy).toHaveBeenNthCalledWith(2, 'cody.autoedit', 'accepted', expect.any(Object))
        expect(recordSpy).toHaveBeenNthCalledWith(
            3,
            'cody.autoedit',
            'invalidTransitionToAccepted',
            undefined
        )

        const suggestedEventPayload = recordSpy.mock.calls[0].at(2)
        expect(suggestedEventPayload).toMatchInlineSnapshot(`
          {
            "billingMetadata": {
              "category": "billable",
              "product": "cody",
            },
            "interactionID": "stable-id-for-tests-2",
            "metadata": {
              "contextSummary.duration": 1.234,
              "contextSummary.prefixChars": 5,
              "contextSummary.suffixChars": 5,
              "contextSummary.totalChars": 10,
              "decorationStats.addedChars": 0,
              "decorationStats.addedLines": 0,
              "decorationStats.modifiedLines": 0,
              "decorationStats.removedChars": 0,
              "decorationStats.removedLines": 0,
              "decorationStats.unchangedChars": 27,
              "decorationStats.unchangedLines": 1,
              "isAccepted": 1,
              "isDisjoint": 0,
              "isFullyOutsideOfVisibleRanges": 1,
              "isFuzzyMatch": 0,
              "isPartiallyOutsideOfVisibleRanges": 1,
              "isRead": 1,
              "isSelectionStale": 1,
              "latency": 300,
              "noActiveTextEditor": 0,
              "otherCompletionProviderEnabled": 0,
              "outsideOfActiveEditor": 1,
              "recordsPrivateMetadataTranscript": 1,
              "source": 1,
              "suggestionsStartedSinceLastSuggestion": 1,
              "timeFromSuggestedAt": 0,
              "triggerKind": 1,
              "windowNotFocused": 1,
            },
            "privateMetadata": {
              "codeToRewrite": "Code to rewrite",
              "contextSummary": {
                "duration": 1.234,
                "prefixChars": 5,
                "retrieverStats": {},
                "strategy": "none",
                "suffixChars": 5,
                "totalChars": 10,
              },
              "decorationStats": {
                "addedChars": 0,
                "addedLines": 0,
                "modifiedLines": 0,
                "removedChars": 0,
                "removedLines": 0,
                "unchangedChars": 27,
                "unchangedLines": 1,
              },
              "gatewayLatency": undefined,
              "id": "stable-id-for-tests-2",
              "inlineCompletionStats": undefined,
              "languageId": "typescript",
              "model": "autoedit-model",
              "otherCompletionProviders": [],
              "prediction": "say("Hello from autoedit!")",
              "responseHeaders": {},
              "upstreamLatency": undefined,
            },
            "version": 0,
          }
        `)

        const acceptedEventPayload = recordSpy.mock.calls[1].at(2)
        // Accepted and suggested event payloads are only different by `billingMetadata`.
        expect(acceptedEventPayload.billingMetadata).toMatchInlineSnapshot(`
          {
            "category": "core",
            "product": "cody",
          }
        `)

        expect(omit(acceptedEventPayload, 'billingMetadata')).toEqual(
            omit(suggestedEventPayload, 'billingMetadata')
        )
    })

    it('reuses the autoedit suggestion ID for the same prediction text', () => {
        const prediction = 'function foo() {}\n'

        // First request (started -> contextLoaded -> loaded -> suggested -> rejected)
        // The request ID should remain "in use"
        createAndAdvanceRequest({
            finalPhase: 'rejected',
            prediction,
        })

        // After acceptance, ID can no longer be reused
        createAndAdvanceRequest({
            finalPhase: 'accepted',
            prediction,
        })

        // Analytics event should use the new stable ID
        createAndAdvanceRequest({
            finalPhase: 'rejected',
            prediction,
        })

        expect(recordSpy).toHaveBeenCalledTimes(4)
        expect(recordSpy).toHaveBeenNthCalledWith(1, 'cody.autoedit', 'suggested', expect.any(Object))
        expect(recordSpy).toHaveBeenNthCalledWith(2, 'cody.autoedit', 'suggested', expect.any(Object))
        expect(recordSpy).toHaveBeenNthCalledWith(3, 'cody.autoedit', 'accepted', expect.any(Object))
        expect(recordSpy).toHaveBeenNthCalledWith(4, 'cody.autoedit', 'suggested', expect.any(Object))

        const suggestedEvent1 = recordSpy.mock.calls[0].at(2)
        const suggestedEvent2 = recordSpy.mock.calls[1].at(2)
        const suggestedEvent3 = recordSpy.mock.calls[3].at(2)

        // First two suggested calls should reuse the same stable ID
        expect(suggestedEvent1.privateMetadata.id).toEqual(suggestedEvent2.privateMetadata.id)
        // The third one should be different because we just accepted a completion
        // which removes the stable ID from the cache.
        expect(suggestedEvent3.privateMetadata.id).not.toBe(suggestedEvent1.privateMetadata.id)
        expect(suggestedEvent3.privateMetadata.id).not.toBe(suggestedEvent2.privateMetadata.id)
    })

    it('logs `discarded` if the suggestion was not suggested for any reason', () => {
        const requestId = autoeditLogger.createRequest(getRequestStartMetadata())
        autoeditLogger.markAsContextLoaded({ requestId, payload: { contextSummary: undefined } })
        autoeditLogger.markAsDiscarded({
            requestId,
            discardReason: autoeditDiscardReason.emptyPrediction,
        })

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith('cody.autoedit', 'discarded', expect.any(Object))

        const discardedEventPayload = recordSpy.mock.calls[0].at(2)
        expect(discardedEventPayload).toMatchInlineSnapshot(`
          {
            "billingMetadata": {
              "category": "core",
              "product": "cody",
            },
            "interactionID": undefined,
            "metadata": {
              "discardReason": 2,
              "otherCompletionProviderEnabled": 0,
              "recordsPrivateMetadataTranscript": 0,
              "triggerKind": 1,
            },
            "privateMetadata": {
              "codeToRewrite": "Code to rewrite",
              "contextSummary": undefined,
              "gatewayLatency": undefined,
              "languageId": "typescript",
              "model": "autoedit-model",
              "otherCompletionProviders": [],
              "upstreamLatency": undefined,
            },
            "version": 0,
          }
        `)
    })

    it('handles invalid transitions by logging debug events (invalidTransitionToXYZ)', () => {
        const requestId = autoeditLogger.createRequest(getRequestStartMetadata())

        // Both calls below are invalid transitions, so the logger logs debug events
        autoeditLogger.markAsSuggested(requestId)
        autoeditLogger.markAsRejected(requestId)

        expect(recordSpy).toHaveBeenCalledTimes(2)
        expect(recordSpy).toHaveBeenNthCalledWith(
            1,
            'cody.autoedit',
            'invalidTransitionToSuggested',
            undefined
        )
        expect(recordSpy).toHaveBeenNthCalledWith(
            2,
            'cody.autoedit',
            'invalidTransitionToRejected',
            undefined
        )
    })

    it('throttles repeated error logs, capturing the first occurrence immediately', () => {
        // Force error logs to be reported:
        vi.spyOn(sentryModule, 'shouldErrorBeReported').mockReturnValue(true)

        const error = new Error('Deliberate test error for autoedit')
        autoeditLogger.logError(error)

        // First occurrence logs right away
        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith(
            'cody.autoedit',
            'error',
            expect.objectContaining({
                version: 0,
                metadata: { count: 1 },
                privateMetadata: expect.objectContaining({
                    message: 'Deliberate test error for autoedit',
                }),
            })
        )

        // Repeated calls should not log immediately
        autoeditLogger.logError(error)
        autoeditLogger.logError(error)
        expect(recordSpy).toHaveBeenCalledTimes(1)
    })
})
