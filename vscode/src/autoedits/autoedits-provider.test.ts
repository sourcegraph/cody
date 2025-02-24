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

import { ContextMixer } from '../completions/context/context-mixer'

import {
    AUTOEDIT_CONTEXT_FETCHING_DEBOUNCE_INTERVAL,
    AUTOEDIT_TOTAL_DEBOUNCE_INTERVAL,
} from './autoedits-provider'
import { AUTOEDIT_VISIBLE_DELAY_MS } from './renderer/manager'
import { autoeditResultFor } from './test-helpers'

describe('AutoeditsProvider', () => {
    let recordSpy: MockInstance
    let stableIdCounter = 0
    let acceptSuggestionCommand: () => Promise<void>
    let rejectSuggestionCommand: () => Promise<void>
    let executedCommands: unknown[] = []

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

    beforeEach(() => {
        stableIdCounter = 0
        executedCommands = []
        recordSpy = vi.spyOn(telemetryRecorder, 'recordEvent')
        vi.spyOn(uuid, 'v4').mockImplementation(() => `stable-id-for-tests-${++stableIdCounter}`)
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

        expect(result?.prediction).toBe(prediction)

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
              "latency": 175,
              "noActiveTextEditor": 0,
              "otherCompletionProviderEnabled": 0,
              "outsideOfActiveEditor": 1,
              "recordsPrivateMetadataTranscript": 1,
              "source": 1,
              "suggestionsStartedSinceLastSuggestion": 1,
              "timeFromSuggestedAt": 100,
              "triggerKind": 1,
              "windowNotFocused": 1,
            },
            "privateMetadata": {
              "codeToRewrite": "const x = ",
              "contextSummary": {
                "duration": 0,
                "prefixChars": 10,
                "retrieverStats": {},
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
              "latency": 175,
              "noActiveTextEditor": 0,
              "otherCompletionProviderEnabled": 0,
              "outsideOfActiveEditor": 1,
              "recordsPrivateMetadataTranscript": 1,
              "source": 1,
              "suggestionsStartedSinceLastSuggestion": 1,
              "timeFromSuggestedAt": 100,
              "triggerKind": 1,
              "windowNotFocused": 1,
            },
            "privateMetadata": {
              "codeToRewrite": "const x = ",
              "contextSummary": {
                "duration": 0,
                "prefixChars": 10,
                "retrieverStats": {},
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
        await vi.advanceTimersByTimeAsync(AUTOEDIT_VISIBLE_DELAY_MS / 2)
        await rejectSuggestionCommand()

        expect(result?.prediction).toBe(prediction)

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
              "latency": 175,
              "otherCompletionProviderEnabled": 0,
              "recordsPrivateMetadataTranscript": 1,
              "source": 1,
              "suggestionsStartedSinceLastSuggestion": 2,
              "timeFromSuggestedAt": 375,
              "triggerKind": 1,
            },
            "privateMetadata": {
              "codeToRewrite": "const x = ",
              "contextSummary": {
                "duration": 0,
                "prefixChars": 10,
                "retrieverStats": {},
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
        await vi.advanceTimersByTimeAsync(AUTOEDIT_VISIBLE_DELAY_MS)
        await rejectSuggestionCommand()

        expect(result?.prediction).toBe(prediction)

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

    describe('Debounce logic', () => {
        it('waits for exactly AUTOEDIT_TOTAL_DEBOUNCE_INTERVAL before calling getPrediction', async () => {
            let getModelResponseCalledAt: number | undefined
            const customGetModelResponse = async () => {
                // Record the current fake timer time when getModelResponse is called
                getModelResponseCalledAt = Date.now()
                return { choices: [{ text: 'const x = 1\n' }] }
            }

            const startTime = Date.now()
            const { promiseResult } = await autoeditResultFor('const x = █\n', {
                prediction: 'const x = 1\n',
                getModelResponse: customGetModelResponse,
                isAutomaticTimersAdvancementDisabled: true,
            })

            // Run all timers to get the result
            await vi.runAllTimersAsync()
            const result = await promiseResult

            expect(result?.prediction).toBe('const x = 1\n')
            expect(getModelResponseCalledAt).toBeDefined()
            // Check that getModelResponse was called only after at least AUTOEDIT_TOTAL_DEBOUNCE_INTERVAL have elapsed
            expect(getModelResponseCalledAt! - startTime).toBe(AUTOEDIT_TOTAL_DEBOUNCE_INTERVAL)
        })

        it('aborts the operation if cancellation occurs during the context fetching debounce interval', async () => {
            let modelResponseCalled = false
            const customGetModelResponse = async () => {
                modelResponseCalled = true
                return { choices: [{ text: 'const x = 1\n' }] }
            }

            const tokenSource = new vscode.CancellationTokenSource()
            const getContextSpy = vi.spyOn(ContextMixer.prototype, 'getContext')

            const { promiseResult } = await autoeditResultFor('const x = █\n', {
                prediction: 'const x = 1\n',
                token: tokenSource.token,
                getModelResponse: customGetModelResponse,
                isAutomaticTimersAdvancementDisabled: true,
            })

            // Wait for the context fetching to start
            await vi.advanceTimersByTimeAsync(AUTOEDIT_CONTEXT_FETCHING_DEBOUNCE_INTERVAL)
            expect(getContextSpy).toHaveBeenCalled()

            // Cancel the auto-edit request
            tokenSource.cancel()

            // Wait for the debounce period to complete to get the result
            await vi.advanceTimersByTimeAsync(AUTOEDIT_TOTAL_DEBOUNCE_INTERVAL)
            const result = await promiseResult

            expect(result).toBeNull()
            expect(modelResponseCalled).toBe(false)
        })
    })
})
