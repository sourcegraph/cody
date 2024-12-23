import omit from 'lodash/omit'
import * as uuid from 'uuid'
import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { ps, telemetryRecorder } from '@sourcegraph/cody-shared'

import { documentAndPosition } from '../../completions/test-helpers'
import * as sentryModule from '../../services/sentry/sentry'
import type { AutoeditModelOptions } from '../adapters/base'

import { AutoeditAnalyticsLogger, type AutoeditSessionID } from './analytics-logger'

describe('AutoeditAnalyticsLogger', () => {
    let autoeditLogger: AutoeditAnalyticsLogger
    let recordSpy: MockInstance
    let stableIdCounter = 0

    const { document, position } = documentAndPosition('█', 'typescript', 'file:///fake-file.ts')

    const modelOptions: AutoeditModelOptions = {
        url: 'https://test-url.com/',
        model: 'autoedit-model',
        apiKey: 'api-key',
        prompt: {
            systemMessage: ps`This is test message`,
            userMessage: ps`This is test prompt text`,
        },
        codeToRewrite: 'This is test code to rewrite',
        userId: 'test-user-id',
        isChatModel: false,
    }

    const sessionStartMetadata: Parameters<AutoeditAnalyticsLogger['createSession']>[0] = {
        languageId: 'typescript',
        model: 'autoedit-model',
        traceId: 'trace-id',
    }

    function createAndAdvanceSession({
        finalPhase,
        prediction,
    }: { finalPhase: 'suggested' | 'accepted' | 'rejected'; prediction: string }): AutoeditSessionID {
        const sessionId = autoeditLogger.createSession(sessionStartMetadata)

        autoeditLogger.markAsContextLoaded({
            sessionId,
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
            sessionId,
            modelOptions: modelOptions,
            payload: {
                prediction,
                source: 'network',
                isFuzzyMatch: false,
                responseHeaders: {},
            },
        })

        autoeditLogger.markAsSuggested(sessionId)
        autoeditLogger.markAsRead(sessionId)

        if (finalPhase === 'accepted') {
            autoeditLogger.markAsAccepted({
                sessionId,
                trackedRange: new vscode.Range(position, position),
                position,
                document,
                prediction,
            })
        }

        if (finalPhase === 'rejected') {
            autoeditLogger.markAsRejected(sessionId)
        }

        return sessionId
    }

    beforeEach(() => {
        autoeditLogger = new AutoeditAnalyticsLogger()
        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')

        stableIdCounter = 0
        vi.spyOn(uuid, 'v4').mockImplementation(() => `stable-id-for-tests-${++stableIdCounter}`)

        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.resetAllMocks()
        vi.clearAllTimers()
    })

    it('logs a suggestion lifecycle (started -> contextLoaded -> loaded -> suggested -> read -> accepted)', () => {
        const prediction = 'console.log("Hello from autoedit!")'
        const sessionId = createAndAdvanceSession({
            finalPhase: 'accepted',
            prediction,
        })

        // Invalid transition attempt
        autoeditLogger.markAsAccepted({
            sessionId,
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
              "isRead": 1,
              "isSelectionStale": 1,
              "latency": 300,
              "lineCount": 1,
              "noActiveTextEditor": 0,
              "otherCompletionProviderEnabled": 0,
              "outsideOfActiveEditor": 1,
              "suggestionsStartedSinceLastSuggestion": 1,
              "windowNotFocused": 1,
            },
            "privateMetadata": {
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
              "source": "network",
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

        // First session (started -> contextLoaded -> loaded -> suggested -> rejected)
        // The session ID should remain "in use"
        createAndAdvanceSession({
            finalPhase: 'rejected',
            prediction,
        })

        // After acceptance, ID can no longer be reused
        createAndAdvanceSession({
            finalPhase: 'accepted',
            prediction,
        })

        // Analytics event should use the new stable ID
        createAndAdvanceSession({
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

    it('logs noResponse if no suggestion was produced', () => {
        const sessionId = autoeditLogger.createSession(sessionStartMetadata)
        autoeditLogger.markAsContextLoaded({ sessionId, payload: { contextSummary: undefined } })
        autoeditLogger.markAsNoResponse(sessionId)

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith('cody.autoedit', 'noResponse', expect.any(Object))
    })

    it('handles invalid transitions by logging debug events (invalidTransitionToXYZ)', () => {
        const sessionId = autoeditLogger.createSession(sessionStartMetadata)

        // Both calls below are invalid transitions, so the logger logs debug events
        autoeditLogger.markAsSuggested(sessionId)
        autoeditLogger.markAsRejected(sessionId)

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
