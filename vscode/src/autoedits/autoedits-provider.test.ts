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
                accessToken: 'sgp_local_f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0f0',
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
              "latency": 100,
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
                "strategy": "auto-edits",
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
              "latency": 100,
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
                "strategy": "auto-edits",
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
              "latency": 100,
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
                "strategy": "auto-edits",
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
        expect(executedCommands).toMatchInlineSnapshot([])
    })

    it('set the cody.supersuggest.active context for inline decoration items', async () => {
        const prediction = 'const a = 1\n'
        await autoeditResultFor('const x = █\n', { prediction })
        expect(executedCommands).toMatchInlineSnapshot(
            expect.arrayContaining([['setContext', 'cody.supersuggest.active', true]])
        )
        await acceptSuggestionCommand()

        // Deactive the context after accepting the suggestion
        expect(executedCommands.length).toBe(3)
        expect(executedCommands[1]).toMatchInlineSnapshot(
            expect.arrayContaining(['setContext', 'cody.supersuggest.active', false])
        )
    })
})
