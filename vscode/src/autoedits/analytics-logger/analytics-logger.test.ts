import omit from 'lodash/omit'
import * as uuid from 'uuid'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { mockAuthStatus, ps, telemetryRecorder } from '@sourcegraph/cody-shared'

import { documentAndPosition } from '../../completions/test-helpers'
import * as sentryModule from '../../services/sentry/sentry'
import type { AutoeditModelOptions } from '../adapters/base'

import {
    AutoeditAnalyticsLogger,
    type AutoeditRequestID,
    autoeditSource,
    autoeditTriggerKind,
} from './analytics-logger'

describe('AutoeditAnalyticsLogger', () => {
    let autoeditLogger: AutoeditAnalyticsLogger
    let recordSpy: MockInstance
    let stableIdCounter = 0

    const { document, position } = documentAndPosition('█', 'typescript', 'file:///fake-file.ts')

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

    const requestStartMetadata: Parameters<AutoeditAnalyticsLogger['createRequest']>[0] = {
        languageId: 'typescript',
        model: 'autoedit-model',
        traceId: 'trace-id',
        triggerKind: autoeditTriggerKind.automatic,
        codeToRewrite: 'Code to rewrite',
    }

    function createAndAdvanceRequest({
        finalPhase,
        prediction,
    }: { finalPhase: 'suggested' | 'accepted' | 'rejected'; prediction: string }): AutoeditRequestID {
        const requestId = autoeditLogger.createRequest(requestStartMetadata)

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
            modelOptions: modelOptions,
            payload: {
                prediction,
                source: autoeditSource.network,
                isFuzzyMatch: false,
                responseHeaders: {},
            },
        })

        autoeditLogger.markAsSuggested(requestId)

        if (finalPhase === 'accepted') {
            autoeditLogger.markAsAccepted({
                requestId,
                trackedRange: new vscode.Range(position, position),
                position,
                document,
                prediction,
            })
        }

        if (finalPhase === 'rejected') {
            autoeditLogger.markAsRejected(requestId)
        }

        return requestId
    }

    beforeEach(() => {
        autoeditLogger = new AutoeditAnalyticsLogger()
        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')
        mockAuthStatus()

        stableIdCounter = 0
        vi.spyOn(uuid, 'v4').mockImplementation(() => `stable-id-for-tests-${++stableIdCounter}`)

        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.resetAllMocks()
        vi.clearAllTimers()
    })

    it('logs a suggestion lifecycle (started -> contextLoaded -> loaded -> suggested -> accepted)', () => {
        const prediction = 'console.log("Hello from autoedit!")'
        const requestId = createAndAdvanceRequest({
            finalPhase: 'accepted',
            prediction,
        })

        // Invalid transition attempt
        autoeditLogger.markAsAccepted({
            requestId,
            trackedRange: new vscode.Range(position, position),
            position,
            document,
            prediction,
        })

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
              "charCount": 35,
              "contextSummary.duration": 1.234,
              "contextSummary.prefixChars": 5,
              "contextSummary.suffixChars": 5,
              "contextSummary.totalChars": 10,
              "displayDuration": 0,
              "isAccepted": 1,
              "isDisjoint": 0,
              "isFullyOutsideOfVisibleRanges": 1,
              "isFuzzyMatch": 0,
              "isPartiallyOutsideOfVisibleRanges": 1,
              "isSelectionStale": 1,
              "latency": 300,
              "lineCount": 1,
              "noActiveTextEditor": 0,
              "otherCompletionProviderEnabled": 0,
              "outsideOfActiveEditor": 1,
              "recordsPrivateMetadataTranscript": 1,
              "source": 1,
              "suggestionsStartedSinceLastSuggestion": 0,
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
              "gatewayLatency": undefined,
              "id": "stable-id-for-tests-2",
              "languageId": "typescript",
              "model": "autoedit-model",
              "otherCompletionProviders": [],
              "prediction": "console.log("Hello from autoedit!")",
              "responseHeaders": {},
              "traceId": "trace-id",
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
        expect(suggestedEvent1.privateMetadata.id).toEqual('stable-id-for-tests-2')
        expect(suggestedEvent2.privateMetadata.id).toEqual('stable-id-for-tests-2')
        // The third one should be different because we just accepted a completion
        // which removes the stable ID from the cache.
        expect(suggestedEvent3.privateMetadata.id).toEqual('stable-id-for-tests-5')
    })

    it('logs `discarded` if the suggestion was not suggested for any reason', () => {
        const requestId = autoeditLogger.createRequest(requestStartMetadata)
        autoeditLogger.markAsContextLoaded({ requestId, payload: { contextSummary: undefined } })
        autoeditLogger.markAsDiscarded(requestId)

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith('cody.autoedit', 'discarded', expect.any(Object))
    })

    it('handles invalid transitions by logging debug events (invalidTransitionToXYZ)', () => {
        const requestId = autoeditLogger.createRequest(requestStartMetadata)

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
