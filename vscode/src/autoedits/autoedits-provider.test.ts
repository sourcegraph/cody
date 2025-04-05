import * as sentryCore from '@sentry/core'
import * as uuid from 'uuid'
import {
    type MockInstance,
    afterAll,
    afterEach,
    beforeAll,
    beforeEach,
    describe,
    expect,
    it,
    vi,
} from 'vitest'
import * as vscode from 'vscode'

import {
    CLIENT_CAPABILITIES_FIXTURE,
    DOTCOM_URL,
    mockAuthStatus,
    mockClientCapabilities,
    mockResolvedConfig,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'

import { mockLocalStorage } from '../services/LocalStorageProvider'
import {
    type AutoeditRequestID,
    autoeditAnalyticsLogger,
    autoeditDiscardReason,
    autoeditTriggerKind,
} from './analytics-logger'
import { AutoeditCompletionItem } from './autoedit-completion-item'
import { AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS } from './autoedits-provider'
import { initImageSuggestionService } from './renderer/image-gen'
import { DEFAULT_AUTOEDIT_VISIBLE_DELAY_MS } from './renderer/manager'
import { THROTTLE_TIME } from './smart-throttle'
import { autoeditResultFor } from './test-helpers'

describe('AutoeditsProvider', () => {
    let recordSpy: MockInstance
    let stableIdCounter = 0
    let acceptSuggestionCommand: () => Promise<void>
    let rejectSuggestionCommand: () => Promise<void>
    let executedCommands: unknown[] = []

    let localStorageData: { [key: string]: unknown } = {}
    mockLocalStorage({
        get: (key: string) => localStorageData[key] || [], // Return empty array as default
        update: (key: string, value: unknown) => {
            localStorageData[key] = value
        },
    } as any)

    beforeAll(() => {
        vi.useFakeTimers()
        vi.spyOn(vscode.commands, 'registerCommand').mockImplementation(((
            command: string,
            callback: () => Promise<void>
        ) => {
            if (command === 'cody.supersuggest.accept') {
                acceptSuggestionCommand = callback
            }
            if (command === 'cody.supersuggest.dismiss') {
                rejectSuggestionCommand = callback
            }

            return { dispose: () => {} }
            // TODO(valery): remove `any` type casting. For some reason
            // `pnpm -C vscode run build` fails wit the type error
            // despite `pnpm tsc --build --watch --force` being happy.
        }) as any)

        vi.spyOn(vscode.commands, 'executeCommand').mockImplementation((...args) => {
            executedCommands.push(args)
            return Promise.resolve()
        })

        mockClientCapabilities(CLIENT_CAPABILITIES_FIXTURE)
        mockResolvedConfig({
            configuration: {},
            auth: {
                credentials: { token: 'sgp_local_f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0' },
                serverEndpoint: DOTCOM_URL.toString(),
            },
        })
        mockAuthStatus()
    })

    beforeEach(async () => {
        await initImageSuggestionService()
        stableIdCounter = 0
        executedCommands = []
        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')
        vi.spyOn(uuid, 'v4').mockImplementation(() => `stable-id-for-tests-${++stableIdCounter}`)
        localStorageData = {}
    })

    afterEach(() => {
        vi.clearAllTimers()
    })

    afterAll(() => {
        vi.clearAllTimers()
        vi.restoreAllMocks()
    })

    it('analytics events for the suggested -> accepted transition', async () => {
        const prediction = 'const x = 1\n'
        const { result } = await autoeditResultFor('const x = █', { prediction })

        // Wait for a timeout to mark a suggestion as read.
        await vi.advanceTimersByTimeAsync(100)
        await acceptSuggestionCommand()

        expect(result?.inlineCompletionItems[0].insertText).toBe(prediction)

        expect(recordSpy).toHaveBeenCalledTimes(2)
        expect(recordSpy).toHaveBeenNthCalledWith(1, 'cody.autoedit', 'suggested', expect.any(Object))
        expect(recordSpy).toHaveBeenNthCalledWith(2, 'cody.autoedit', 'accepted', expect.any(Object))

        const suggestedEventPayload = recordSpy.mock.calls[0].at(2)
        expect(suggestedEventPayload).toMatchInlineSnapshot(`
          {
            "billingMetadata": {
              "category": "billable",
              "product": "cody",
            },
            "interactionID": "stable-id-for-tests-2",
            "metadata": {
              "acceptReason": 1,
              "contextSummary.duration": 0,
              "contextSummary.prefixChars": 10,
              "contextSummary.suffixChars": 0,
              "contextSummary.totalChars": 10,
              "inlineCompletionStats.charCount": 2,
              "inlineCompletionStats.lineCount": 2,
              "isAccepted": 1,
              "isDisjoint": 0,
              "isFullyOutsideOfVisibleRanges": 1,
              "isFuzzyMatch": 0,
              "isPartiallyOutsideOfVisibleRanges": 1,
              "isRead": 1,
              "isSelectionStale": 1,
              "latency": 100,
              "noActiveTextEditor": 0,
              "otherCompletionProviderEnabled": 0,
              "outsideOfActiveEditor": 1,
              "recordsPrivateMetadataTranscript": 1,
              "source": 1,
              "suggestionsStartedSinceLastSuggestion": 1,
              "timeFromSuggestedAt": 110,
              "triggerKind": 1,
              "windowNotFocused": 1,
            },
            "privateMetadata": {
              "codeToRewrite": "const x = ",
              "contextSummary": {
                "duration": 0,
                "prefixChars": 10,
                "retrieverStats": [],
                "strategy": "auto-edit",
                "suffixChars": 0,
                "totalChars": 10,
              },
              "decorationStats": undefined,
              "gatewayLatency": undefined,
              "id": "stable-id-for-tests-2",
              "inlineCompletionStats": {
                "charCount": 2,
                "lineCount": 2,
              },
              "languageId": "typescript",
              "model": "autoedits-deepseek-lite-default",
              "otherCompletionProviders": [],
              "prediction": "const x = 1
          ",
              "responseHeaders": {},
              "upstreamLatency": undefined,
            },
            "version": 0,
          }
        `)

        const acceptedEventPayload = recordSpy.mock.calls[1].at(2)
        expect(acceptedEventPayload).toMatchInlineSnapshot(`
          {
            "billingMetadata": {
              "category": "core",
              "product": "cody",
            },
            "interactionID": "stable-id-for-tests-2",
            "metadata": {
              "acceptReason": 1,
              "contextSummary.duration": 0,
              "contextSummary.prefixChars": 10,
              "contextSummary.suffixChars": 0,
              "contextSummary.totalChars": 10,
              "inlineCompletionStats.charCount": 2,
              "inlineCompletionStats.lineCount": 2,
              "isAccepted": 1,
              "isDisjoint": 0,
              "isFullyOutsideOfVisibleRanges": 1,
              "isFuzzyMatch": 0,
              "isPartiallyOutsideOfVisibleRanges": 1,
              "isRead": 1,
              "isSelectionStale": 1,
              "latency": 100,
              "noActiveTextEditor": 0,
              "otherCompletionProviderEnabled": 0,
              "outsideOfActiveEditor": 1,
              "recordsPrivateMetadataTranscript": 1,
              "source": 1,
              "suggestionsStartedSinceLastSuggestion": 1,
              "timeFromSuggestedAt": 110,
              "triggerKind": 1,
              "windowNotFocused": 1,
            },
            "privateMetadata": {
              "codeToRewrite": "const x = ",
              "contextSummary": {
                "duration": 0,
                "prefixChars": 10,
                "retrieverStats": [],
                "strategy": "auto-edit",
                "suffixChars": 0,
                "totalChars": 10,
              },
              "decorationStats": undefined,
              "gatewayLatency": undefined,
              "id": "stable-id-for-tests-2",
              "inlineCompletionStats": {
                "charCount": 2,
                "lineCount": 2,
              },
              "languageId": "typescript",
              "model": "autoedits-deepseek-lite-default",
              "otherCompletionProviders": [],
              "prediction": "const x = 1
          ",
              "responseHeaders": {},
              "upstreamLatency": undefined,
            },
            "version": 0,
          }
        `)
    })

    it('analytics events for the suggested -> rejected transition', async () => {
        const prediction = 'const x = 1\n'
        const { result } = await autoeditResultFor('const x = █', { prediction })

        // The suggestion should not be marked as read.
        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOEDIT_VISIBLE_DELAY_MS / 2)
        await rejectSuggestionCommand()

        expect(result?.inlineCompletionItems[0].insertText).toBe(prediction)

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenNthCalledWith(1, 'cody.autoedit', 'suggested', expect.any(Object))

        const suggestedEventPayload = recordSpy.mock.calls[0].at(2)
        expect(suggestedEventPayload).toMatchInlineSnapshot(`
          {
            "billingMetadata": {
              "category": "billable",
              "product": "cody",
            },
            "interactionID": "stable-id-for-tests-2",
            "metadata": {
              "contextSummary.duration": 0,
              "contextSummary.prefixChars": 10,
              "contextSummary.suffixChars": 0,
              "contextSummary.totalChars": 10,
              "inlineCompletionStats.charCount": 2,
              "inlineCompletionStats.lineCount": 2,
              "isAccepted": 0,
              "isFuzzyMatch": 0,
              "isRead": 0,
              "latency": 100,
              "otherCompletionProviderEnabled": 0,
              "recordsPrivateMetadataTranscript": 1,
              "rejectReason": 1,
              "source": 1,
              "suggestionsStartedSinceLastSuggestion": 2,
              "timeFromSuggestedAt": 385,
              "triggerKind": 1,
            },
            "privateMetadata": {
              "codeToRewrite": "const x = ",
              "contextSummary": {
                "duration": 0,
                "prefixChars": 10,
                "retrieverStats": [],
                "strategy": "auto-edit",
                "suffixChars": 0,
                "totalChars": 10,
              },
              "decorationStats": undefined,
              "gatewayLatency": undefined,
              "id": "stable-id-for-tests-2",
              "inlineCompletionStats": {
                "charCount": 2,
                "lineCount": 2,
              },
              "languageId": "typescript",
              "model": "autoedits-deepseek-lite-default",
              "otherCompletionProviders": [],
              "prediction": "const x = 1
          ",
              "responseHeaders": {},
              "upstreamLatency": undefined,
            },
            "version": 0,
          }
        `)
    })

    it('marks the suggestion as read after a certain timeout', async () => {
        const prediction = 'const x = 1\n'
        const { result } = await autoeditResultFor('const x = █', { prediction })
        // The suggestion should be marked as read.
        await vi.advanceTimersByTimeAsync(DEFAULT_AUTOEDIT_VISIBLE_DELAY_MS)
        await rejectSuggestionCommand()

        expect(result?.inlineCompletionItems[0].insertText).toBe(prediction)

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenNthCalledWith(1, 'cody.autoedit', 'suggested', expect.any(Object))

        const suggestedEventPayload = recordSpy.mock.calls[0].at(2)
        expect(suggestedEventPayload.metadata.isRead).toBe(1)
    })

    it('errors are reported via telemetry recorded and Sentry', async () => {
        const captureExceptionSpy = vi.spyOn(sentryCore, 'captureException')
        const testError = new Error('test-error')

        const { result } = await autoeditResultFor('const x = █', {
            prediction: 'const x = 1\n',
            getModelResponse() {
                throw testError
            },
        })

        expect(result).toBe(null)

        // Error is captured by the telemetry recorded
        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenNthCalledWith(1, 'cody.autoedit', 'error', expect.any(Object))

        const errorPayload = recordSpy.mock.calls[0].at(2)
        expect(errorPayload).toMatchInlineSnapshot(`
          {
            "billingMetadata": undefined,
            "metadata": {
              "count": 1,
            },
            "privateMetadata": {
              "message": "test-error",
              "traceId": undefined,
            },
            "version": 0,
          }
        `)

        // Error is captured by the Sentry service
        expect(captureExceptionSpy).toHaveBeenCalledTimes(1)

        const captureExceptionPayload = captureExceptionSpy.mock.calls[0].at(0)
        expect(captureExceptionPayload).toEqual(testError)
    })

    it('rejects the current suggestion when the new one is shown', async () => {
        const prediction = 'const x = 1\n'
        const { provider } = await autoeditResultFor('const a = █\n', { prediction })
        await autoeditResultFor('const b = █\n', { prediction, provider })

        expect(recordSpy).toHaveBeenCalledTimes(1)
        expect(recordSpy).toHaveBeenNthCalledWith(1, 'cody.autoedit', 'suggested', expect.any(Object))

        // We expect the autoedits context to be activated twice once for each suggestion.
        expect(executedCommands).toMatchInlineSnapshot(`
          [
            [
              "setContext",
              "cody.supersuggest.active",
              true,
            ],
            [
              "setContext",
              "cody.supersuggest.active",
              false,
            ],
            [
              "editor.action.inlineSuggest.hide",
            ],
            [
              "setContext",
              "cody.supersuggest.active",
              true,
            ],
          ]
        `)
    })

    it('do not set the the cody.supersuggest.active context for inline completion items', async () => {
        const prediction = 'const x = 1\n'
        await autoeditResultFor('const x = █\n', { prediction })
        expect(executedCommands).toMatchInlineSnapshot(`
            []
        `)
    })

    it('set the cody.supersuggest.active context for inline decoration items', async () => {
        const prediction = 'const a = 1\n'
        await autoeditResultFor('const x = █\n', { prediction })
        expect(executedCommands).toMatchInlineSnapshot(`
            [
              [
                "setContext",
                "cody.supersuggest.active",
                true,
              ],
            ]
        `)
        await acceptSuggestionCommand()

        // Deactives the context after accepting the suggestion
        expect(executedCommands.length).toBe(3)
        expect(executedCommands[1]).toMatchInlineSnapshot(`
            [
              "setContext",
              "cody.supersuggest.active",
              false,
            ]
        `)
    })

    it('unset the cody.supersuggest.active context for inline decoration rejection', async () => {
        const prediction = 'const a = 1\n'
        await autoeditResultFor('const x = █\n', { prediction })
        expect(executedCommands).toMatchInlineSnapshot(`
            [
              [
                "setContext",
                "cody.supersuggest.active",
                true,
              ],
            ]
        `)
        await rejectSuggestionCommand()

        // Deactives the context after accepting the suggestion
        expect(executedCommands.length).toBe(3)
        expect(executedCommands[1]).toMatchInlineSnapshot(`
            [
              "setContext",
              "cody.supersuggest.active",
              false,
            ]
        `)
    })

    it('do not trigger the editBuilder for inline completion items', async () => {
        const prediction = 'const x = 1\n'
        const { editBuilder } = await autoeditResultFor('const x = █\n', { prediction })

        await acceptSuggestionCommand()
        expect(editBuilder.size).toBe(0)
    })

    it('trigger the editBuilder for inline decorations items', async () => {
        const prediction = 'const a = 1\n'
        const { editBuilder } = await autoeditResultFor('const x = █\n', { prediction })

        await acceptSuggestionCommand()
        expect(editBuilder.size).toBe(1)
    })

    it('does not trigger a suggestion if the user has selectedCompletionInfo', async () => {
        const prediction = 'const x = 1\n'
        const completionItem = { range: new vscode.Range(0, 0, 0, 5), text: 'beans' }
        const { result } = await autoeditResultFor('const x = █\n', {
            prediction,
            inlineCompletionContext: {
                triggerKind: autoeditTriggerKind.automatic,
                selectedCompletionInfo: completionItem,
            },
        })
        const id = result?.inlineCompletionItems[0].id as AutoeditRequestID
        expect(result?.inlineCompletionItems).toStrictEqual([
            new AutoeditCompletionItem({
                id,
                insertText: completionItem.text,
                range: completionItem.range,
            }),
        ])
    })

    describe('smart-throttle', () => {
        it('does not wait before calling getPrediction first time', async () => {
            let getModelResponseCalledAt: number | undefined
            const prediction = 'const x = 1\n'
            const customGetModelResponse = async () => {
                // Record the current fake timer time when getModelResponse is called
                getModelResponseCalledAt = Date.now()
                return {
                    type: 'success',
                    responseBody: {
                        choices: [{ text: prediction }],
                    },
                    requestUrl: 'test-url.com/completions',
                    requestHeaders: {},
                    responseHeaders: {},
                } as const
            }

            const startTime = Date.now()
            const { promiseResult } = await autoeditResultFor('const x = █\n', {
                prediction,
                getModelResponse: customGetModelResponse,
                isAutomaticTimersAdvancementDisabled: true,
            })

            // Run all timers to get the result
            await vi.advanceTimersByTimeAsync(10000)
            const result = await promiseResult

            expect(result?.inlineCompletionItems[0].insertText).toBe('const x = 1')
            expect(getModelResponseCalledAt).toBeDefined()
            // Check that getModelResponse was called only after at least AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS have elapsed
            expect(getModelResponseCalledAt! - startTime).toBe(0)
        })

        it('consequtive calls are throttled', async () => {
            const calls = [
                { prediction: 'const x = 1\n', getModelResponseCalledAt: -1 },
                { prediction: 'const x = 12345\n', getModelResponseCalledAt: -1 },
            ]

            const customGetModelResponse = (call: (typeof calls)[number]) => async () => {
                // Record the current fake timer time when getModelResponse is called
                call.getModelResponseCalledAt = performance.now()
                await vi.advanceTimersByTimeAsync(50)
                return {
                    type: 'success',
                    responseBody: {
                        choices: [{ text: call.prediction }],
                    },
                    requestUrl: 'test-url.com/completions',
                    requestHeaders: {},
                    responseHeaders: {},
                } as const
            }

            const { promiseResult: promiseResult1, provider } = await autoeditResultFor(
                'const x = █\n',
                {
                    prediction: calls[0].prediction,
                    getModelResponse: customGetModelResponse(calls[0]),
                    isAutomaticTimersAdvancementDisabled: true,
                }
            )

            const delayBeforeSecondCall = AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS + 5
            await vi.advanceTimersByTimeAsync(delayBeforeSecondCall)
            const secondCallStartedAt = performance.now()

            const { promiseResult: promiseResult2 } = await autoeditResultFor('const x = 123█\n', {
                prediction: calls[1].prediction,
                getModelResponse: customGetModelResponse(calls[1]),
                isAutomaticTimersAdvancementDisabled: true,
                provider,
                documentVersion: 2,
            })

            // Run all timers to get the result
            await vi.advanceTimersByTimeAsync(10000)
            const result1 = await promiseResult1
            const result2 = await promiseResult2

            // The first call is aborted because the second call is triggered before the
            // `customGetModelResponse` function has returned.
            expect(result1).toBeNull()

            // Insert text includes duplicated the existing numbers becase we have inline decorations
            // to remove "123" and replace it with "12345".
            expect(result2?.inlineCompletionItems[0].insertText).toBe('const x = 12312345')

            // The first call is executed immediately.
            expect(calls[0].getModelResponseCalledAt).toBe(0)

            // The second call is executed after the throttle interval.
            expect(calls[1].getModelResponseCalledAt).toBe(50)
            expect(calls[1].getModelResponseCalledAt - secondCallStartedAt).toBe(
                THROTTLE_TIME - delayBeforeSecondCall
            )
        })

        it('consequtive calls are throttled and intermediate calls are aborted', async () => {
            const calls = [
                { prediction: 'const x = 1\n', getModelResponseCalledAt: -1 },
                { prediction: 'const x = 12345\n', getModelResponseCalledAt: -1 },
                { prediction: 'const x = 123\nconst y = 23456\n', getModelResponseCalledAt: -1 },
                { prediction: 'const x = 123\nconst y = 12345\n', getModelResponseCalledAt: -1 },
            ]

            const customGetModelResponse = (call: (typeof calls)[number]) => async () => {
                // Record the current fake timer time when getModelResponse is called
                call.getModelResponseCalledAt = performance.now()
                await vi.advanceTimersByTimeAsync(0)
                return {
                    type: 'success',
                    responseBody: {
                        choices: [{ text: call.prediction }],
                    },
                    requestUrl: 'test-url.com/completions',
                    requestHeaders: {},
                    responseHeaders: {},
                } as const
            }

            const { promiseResult: promiseResult1, provider } = await autoeditResultFor(
                'const x = █\n',
                {
                    prediction: calls[0].prediction,
                    getModelResponse: customGetModelResponse(calls[0]),
                    isAutomaticTimersAdvancementDisabled: true,
                }
            )

            const delayBeforeSecondCall = AUTOEDIT_INITIAL_DEBOUNCE_INTERVAL_MS + 5
            await vi.advanceTimersByTimeAsync(delayBeforeSecondCall)

            const { promiseResult: promiseResult2 } = await autoeditResultFor('const x = 123█\n', {
                prediction: calls[1].prediction,
                getModelResponse: customGetModelResponse(calls[1]),
                isAutomaticTimersAdvancementDisabled: true,
                provider,
                documentVersion: 2,
            })

            await vi.advanceTimersByTimeAsync(25)

            const { promiseResult: promiseResult3 } = await autoeditResultFor(
                'const x = 123\nconst y = █\n',
                {
                    prediction: calls[2].prediction,
                    getModelResponse: customGetModelResponse(calls[2]),
                    isAutomaticTimersAdvancementDisabled: true,
                    provider,
                    documentVersion: 3,
                }
            )

            await vi.advanceTimersByTimeAsync(11)

            const { promiseResult: promiseResult4 } = await autoeditResultFor(
                'const x = 123\nconst y = 12█\n',
                {
                    prediction: calls[3].prediction,
                    getModelResponse: customGetModelResponse(calls[3]),
                    isAutomaticTimersAdvancementDisabled: true,
                    provider,
                    documentVersion: 4,
                }
            )

            // Run all timers to get the result
            await vi.advanceTimersByTimeAsync(10000)
            const [result1, result2, result3, result4] = await Promise.all([
                promiseResult1,
                promiseResult2,
                promiseResult3,
                promiseResult4,
            ])

            // The first call is aborted because the second call is triggered before the
            // `customGetModelResponse` function has returned.
            expect(result1).toBeNull()
            expect(result2).toBeNull()
            expect(result3).toBeNull()
            expect(result4?.inlineCompletionItems[0].insertText).toBe('const y = 1212345')

            // The first call is executed immediately.
            expect(calls[0].getModelResponseCalledAt).toBe(0)
            // The second call is aborted because the third call
            expect(calls[1].getModelResponseCalledAt).toBe(-1)
            // The third call is throttled against the only executed (first) call
            expect(calls[2].getModelResponseCalledAt).toBe(50)
        })

        it('the abort signal is propagated to the model request', async () => {
            const markAsDiscardedSpy = vi.spyOn(autoeditAnalyticsLogger, 'markAsDiscarded')

            const { promiseResult, provider } = await autoeditResultFor('const x = █\n', {
                prediction: 'const x = 1\n',
                isAutomaticTimersAdvancementDisabled: true,
                getModelResponse: async ({ abortSignal }) => {
                    provider.smartThrottleService.lastRequest?.abort()

                    if (abortSignal.aborted) {
                        return {
                            type: 'aborted',
                            requestUrl: 'test-url.com/completions',
                            requestHeaders: {},
                            responseHeaders: {},
                        } as const
                    }

                    return {
                        type: 'success',
                        responseBody: { choices: [{ text: 'const x = 1\n' }] },
                        requestUrl: 'test-url.com/completions',
                        requestHeaders: {},
                        responseHeaders: {},
                    } as const
                },
            })

            await vi.advanceTimersToNextTimerAsync()
            await promiseResult

            expect(promiseResult).resolves.toBeNull()
            expect(markAsDiscardedSpy).toHaveBeenCalledTimes(1)
            expect(markAsDiscardedSpy).toHaveBeenCalledWith({
                requestId: expect.any(String),
                discardReason: autoeditDiscardReason.clientAborted,
            })
        })
    })
})
