import { type MockInstance, afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { ps, telemetryRecorder } from '@sourcegraph/cody-shared'

import * as sentryModule from '../../services/sentry/sentry'
import type { AutoeditModelOptions } from '../adapters/base'

import { AutoeditAnalyticsLogger } from './analytics-logger'

// Ensure we can override shouldErrorBeReported in each test.
vi.mock('../../services/sentry/sentry', async () => {
    const actual: typeof import('../../services/sentry/sentry') = await vi.importActual(
        '../../services/sentry/sentry'
    )
    return {
        ...actual,
        shouldErrorBeReported: vi.fn(),
    }
})

describe('AutoeditAnalyticsLogger', () => {
    let autoeditLogger: AutoeditAnalyticsLogger
    let recordSpy: MockInstance
    const fakeDocument = {
        offsetAt: () => 0,
        uri: { toString: () => 'file:///fake-file.ts' },
    } as unknown as vscode.TextDocument
    const fakePosition = new vscode.Position(0, 0)
    const defaultModelOptions: AutoeditModelOptions = {
        url: 'https://my-test-url.com/',
        model: 'my-autoedit-model',
        apiKey: 'my-api-key',
        prompt: {
            systemMessage: ps`This is test message`,
            userMessage: ps`This is test prompt text`,
        },
        codeToRewrite: 'This is test code to rewrite',
        userId: 'test-user-id',
        isChatModel: false,
    }

    beforeEach(() => {
        autoeditLogger = new AutoeditAnalyticsLogger()
        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')
    })

    afterEach(() => {
        vi.resetAllMocks()
    })

    it('logs a suggestion lifecycle (started -> contextLoaded -> loaded -> suggested -> read -> accepted)', () => {
        // 1. Create session
        const sessionId = autoeditLogger.createSession({
            languageId: 'typescript',
            model: 'my-autoedit-model',
            traceId: 'trace-xyz',
        })

        // 2. Mark context loaded
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

        // 3. Mark loaded
        const prediction = 'console.log("Hello from autoedit!")'
        autoeditLogger.markAsLoaded({
            sessionId,
            modelOptions: defaultModelOptions,
            payload: {
                prediction,
                source: 'network',
                isFuzzyMatch: false,
                responseHeaders: {},
            },
        })

        // 4. Mark suggested
        autoeditLogger.markAsSuggested(sessionId)

        // 5. Mark read
        autoeditLogger.markAsRead(sessionId)

        // 6. Mark accepted
        autoeditLogger.markAsAccepted({
            sessionId,
            trackedRange: new vscode.Range(fakePosition, fakePosition),
            position: fakePosition,
            document: fakeDocument,
            prediction,
        })

        // Since the logger short-circuits after logging once (by setting suggestionLoggedAt),
        // we see exactly ONE event record with action = "suggested".
        // We only check that it's "cody.autoedit", "suggested", and an object with certain keys.
        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith(
            'cody.autoedit',
            'suggested',
            expect.objectContaining({
                version: 0,
                billingMetadata: expect.any(Object),
                metadata: expect.any(Object),
                privateMetadata: expect.any(Object),
            })
        )
    })

    it('reuses the autoedit suggestion ID for the same prediction text', () => {
        const prediction = 'function foo() {}\n'

        // FIRST SESSION (started -> contextLoaded -> loaded -> suggested)
        const session1 = autoeditLogger.createSession({
            languageId: 'typescript',
            model: 'my-autoedit-model',
            traceId: 'trace-abc',
        })
        autoeditLogger.markAsContextLoaded({
            sessionId: session1,
            payload: { contextSummary: undefined },
        })
        autoeditLogger.markAsLoaded({
            sessionId: session1,
            modelOptions: defaultModelOptions,
            payload: {
                prediction,
                source: 'network',
                isFuzzyMatch: false,
                responseHeaders: {},
            },
        })
        autoeditLogger.markAsSuggested(session1)
        // We do NOT accept or reject so that the ID remains "in use."

        // SECOND SESSION with the same text
        const session2 = autoeditLogger.createSession({
            languageId: 'typescript',
            model: 'my-autoedit-model',
            traceId: 'trace-def',
        })
        autoeditLogger.markAsContextLoaded({
            sessionId: session2,
            payload: { contextSummary: undefined },
        })
        autoeditLogger.markAsLoaded({
            sessionId: session2,
            modelOptions: defaultModelOptions,
            payload: {
                prediction,
                source: 'cache',
                isFuzzyMatch: true,
                responseHeaders: {},
            },
        })
        autoeditLogger.markAsSuggested(session2)

        // Accept the second session to finalize it
        autoeditLogger.markAsAccepted({
            sessionId: session2,
            trackedRange: new vscode.Range(fakePosition, fakePosition),
            position: fakePosition,
            document: fakeDocument,
            prediction,
        })

        // After acceptance, ID can no longer be reused
        const session3 = autoeditLogger.createSession({
            languageId: 'typescript',
            model: 'my-autoedit-model',
            traceId: 'trace-ghi',
        })
        autoeditLogger.markAsContextLoaded({
            sessionId: session3,
            payload: { contextSummary: undefined },
        })
        autoeditLogger.markAsLoaded({
            sessionId: session3,
            modelOptions: defaultModelOptions,
            payload: {
                prediction,
                source: 'cache',
                isFuzzyMatch: true,
                responseHeaders: {},
            },
        })

        // Expect 1 telemetry call from the acceptance on session2
        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith('cody.autoedit', 'suggested', expect.any(Object))
    })

    it('logs noResponse if no suggestion was produced', () => {
        // Start a session but never actually produce a suggestion
        const sessionId = autoeditLogger.createSession({
            languageId: 'typescript',
            model: 'my-autoedit-model',
            traceId: 'trace-nr',
        })
        autoeditLogger.markAsContextLoaded({
            sessionId,
            payload: { contextSummary: undefined },
        })
        autoeditLogger.markAsNoResponse(sessionId)

        // We see a single telemetry event ("noResponse"), with any standard shape
        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenCalledWith(
            'cody.autoedit',
            'noResponse',
            expect.objectContaining({
                version: 0,
            })
        )
    })

    it('logs a rejection event after suggestion', () => {
        // A valid chain: started -> contextLoaded -> loaded -> suggested -> rejected
        const sessionId = autoeditLogger.createSession({
            languageId: 'typescript',
            model: 'my-autoedit-model',
            traceId: 'trace-rej',
        })
        autoeditLogger.markAsContextLoaded({
            sessionId,
            payload: { contextSummary: undefined },
        })
        autoeditLogger.markAsLoaded({
            sessionId,
            modelOptions: defaultModelOptions,
            payload: {
                prediction: 'console.warn("reject test")',
                source: 'network',
                isFuzzyMatch: false,
                responseHeaders: {},
            },
        })
        autoeditLogger.markAsSuggested(sessionId)

        // The user rejects
        autoeditLogger.markAsRejected(sessionId)

        // The logger lumps final data into the single "suggested" event call.
        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenNthCalledWith(
            1,
            'cody.autoedit',
            'suggested',
            expect.objectContaining({
                version: 0,
            })
        )
    })

    it('handles invalid transitions by logging debug events (invalidTransitionToXYZ)', () => {
        const sessionId = autoeditLogger.createSession({
            languageId: 'typescript',
            model: 'my-autoedit-model',
            traceId: 'trace-bad',
        })

        // Both calls below are invalid transitions, so the logger logs debug events
        autoeditLogger.markAsSuggested(sessionId)
        autoeditLogger.markAsRejected(sessionId)

        // "invalidTransitionTosuggested" and then "invalidTransitionTorejected"
        expect(recordSpy).toHaveBeenCalledTimes(2)
        expect(recordSpy).toHaveBeenNthCalledWith(
            1,
            'cody.autoedit',
            'invalidTransitionTosuggested',
            undefined
        )
        expect(recordSpy).toHaveBeenNthCalledWith(
            2,
            'cody.autoedit',
            'invalidTransitionTorejected',
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
