import {
    type ClientConfiguration,
    type CodeCompletionsParams,
    contextFiltersProvider,
    currentAuthStatus,
    featureFlagProvider,
    nextTick,
    telemetryRecorder,
} from '@sourcegraph/cody-shared'
import { Observable } from 'observable-fns'
import { type MockInstance, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'
import { mockLocalStorage } from '../services/LocalStorageProvider'
import { DEFAULT_VSCODE_SETTINGS, vsCodeMocks } from '../testutils/mocks'
import { getCurrentDocContext } from './get-current-doc-context'
import { TriggerKind } from './get-inline-completions'
import { initCompletionProviderConfig, params } from './get-inline-completions-tests/helpers'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import * as CompletionLogger from './logger'
import { createProvider } from './providers/anthropic'
import type { FetchCompletionResult } from './providers/shared/fetch-and-process-completions'
import {
    type GenerateCompletionsOptions,
    Provider,
    type ProviderOptions,
} from './providers/shared/provider'
import type { RequestParams } from './request-manager'
import { documentAndPosition } from './test-helpers'
import type { InlineCompletionItemWithAnalytics } from './text-processing/process-inline-completions'
import { sleep } from './utils'

vi.mock('vscode', async () => {
    const { vsCodeMocks, Disposable } = await import('../testutils/mocks')
    return {
        ...vsCodeMocks,
        Disposable,
        workspace: {
            ...vsCodeMocks.workspace,
            onDidChangeTextDocument() {
                return null
            },
        },
    }
})

const DUMMY_CONTEXT: vscode.InlineCompletionContext = {
    selectedCompletionInfo: undefined,
    triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
}

const getAnalyticEventCalls = (mockInstance: MockInstance) => {
    return mockInstance.mock.calls.map(args => {
        const events = args.slice(0, 2)

        const isSuggestion = events.at(1) === 'suggested'
        if (isSuggestion) {
            const metadata = args.at(2)?.metadata
            if (!metadata || metadata.read === undefined) {
                throw new Error(
                    'Unable to extract metadata from analytics calls. Did we change how we log events?'
                )
            }

            events.push({ read: Boolean(metadata.read) })
            return events
        }

        return events
    })
}

class MockRequestProvider extends Provider {
    public didFinishNetworkRequest = false
    public didAbort = false
    protected next: () => void = () => {}
    protected responseQueue: FetchCompletionResult[][] = []
    private generateOptions: GenerateCompletionsOptions

    constructor(options: ProviderOptions, testOptions: GenerateCompletionsOptions) {
        super(options)
        this.generateOptions = testOptions
    }

    public yield(completions: string[] | InlineCompletionItemWithAnalytics[], keepAlive = false) {
        const result = completions.map(content =>
            typeof content === 'string'
                ? {
                      completion: { insertText: content, stopReason: 'test' },
                      docContext: this.generateOptions.docContext,
                  }
                : {
                      completion: content,
                      docContext: this.generateOptions.docContext,
                  }
        )

        this.responseQueue.push(result)
        this.didFinishNetworkRequest = !keepAlive
        this.next()
    }

    public getRequestParams(options: GenerateCompletionsOptions): CodeCompletionsParams {
        return {} as any as CodeCompletionsParams
    }

    public async *generateCompletions(
        options: GenerateCompletionsOptions,
        abortSignal: AbortSignal
    ): AsyncGenerator<FetchCompletionResult[]> {
        abortSignal.addEventListener('abort', () => {
            this.didAbort = true
        })

        while (!(this.didFinishNetworkRequest && this.responseQueue.length === 0)) {
            while (this.responseQueue.length > 0) {
                yield this.responseQueue.shift()!
            }

            // Wait for the next yield
            this.responseQueue = []
            if (!this.didFinishNetworkRequest) {
                await new Promise<void>(resolve => {
                    this.next = resolve
                })
            }
        }
    }
}

function getInlineCompletionProvider(
    args: Partial<ConstructorParameters<typeof InlineCompletionItemProvider>[0]> = {}
): InlineCompletionItemProvider {
    vi.spyOn(featureFlagProvider, 'evaluatedFeatureFlag').mockReturnValue(Observable.of(false))
    return new InlineCompletionItemProvider({
        completeSuggestWidgetSelection: true,
        triggerDelay: 0,
        statusBar: { addError: () => {}, hasError: () => {}, startLoading: () => {} } as any,
        provider: createProvider({
            authStatus: currentAuthStatus(),
            provider: 'default',
            source: 'local-editor-settings',
        }),
        firstCompletionTimeout:
            args?.firstCompletionTimeout ?? DEFAULT_VSCODE_SETTINGS.autocompleteFirstCompletionTimeout,
        ...args,
    })
}

function createNetworkProvider(params: RequestParams): MockRequestProvider {
    const providerOptions: GenerateCompletionsOptions = {
        docContext: params.docContext,
        document: params.document,
        position: params.position,
        multiline: false,
        numberOfCompletionsToGenerate: 1,
        firstCompletionTimeout: 1500,
        triggerKind: TriggerKind.Automatic,
        completionLogId: 'mock-log-id' as CompletionLogger.CompletionLogID,
        snippets: [],
    }

    return new MockRequestProvider(
        {
            id: 'mock-provider',
            legacyModel: 'test-model',
            source: 'local-editor-settings',
        },
        providerOptions
    )
}

function createCompletion(textWithCursor: string, provider: InlineCompletionItemProvider) {
    const { document, position } = documentAndPosition(textWithCursor)
    const docContext = getCurrentDocContext({
        document,
        position,
        maxPrefixLength: 1000,
        maxSuffixLength: 1000,
        context: undefined,
    })

    const mockRequestProvider = createNetworkProvider({
        document,
        position,
        docContext,
    } as RequestParams)

    return {
        mockRequestProvider,
        resolve: async (
            completion: string,
            { delay = 0, duration = 0 }: { delay: number; duration: number }
        ) => {
            await sleep(delay)
            const promise = provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
            await sleep(duration)
            mockRequestProvider.yield([completion])
            return promise
        },
    }
}

// TODO: Update tests to account for document and cursor positions introduced in PR:
// https://github.com/sourcegraph/cody/pull/4984
describe.skip('InlineCompletionItemProvider E2E', () => {
    describe('smart throttle in-flight requests', () => {
        beforeAll(() => {
            initCompletionProviderConfig({ configuration: {} })
            mockLocalStorage()
        })

        beforeEach(() => {
            vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
        })

        /**
         * Scenario:
         * R1--------
         *          ^Marked for suggestion
         *          ^Suggested (when `logSuggestionEvents` is eventually called)
         *             R2-------- (different prefix)
         *                       ^Marked for suggestion
         *                       ^Suggested (when `logSuggestionEvents` is eventually called)
         */
        it('handles subsequent requests, that are not parallel', async () => {
            vi.useFakeTimers()
            const logSpy: MockInstance = vi.spyOn(telemetryRecorder, 'recordEvent')
            const provider = getInlineCompletionProvider()

            const { resolve: resolve1 } = createCompletion('console.█', provider)
            const { resolve: resolve2 } = createCompletion('console.log(█', provider)

            const [result1, result2] = await Promise.all([
                resolve1("error('hello')", { duration: 100, delay: 0 }),
                resolve2("'hello')", { duration: 100, delay: 120 }), // Ensure this is triggered after the first one is resolved
                vi.advanceTimersByTimeAsync(400), // Enough for both to be shown
            ])

            // Result 1 is used
            expect(result1).toBeDefined()
            // Result 2 is used
            expect(result2).toBeDefined()

            // Enough for completion events to be logged
            vi.advanceTimersByTime(1000)
            CompletionLogger.logSuggestionEvents(true)

            expect(getAnalyticEventCalls(logSpy)).toMatchInlineSnapshot(`
              [
                [
                  "cody.completion",
                  "suggested",
                  {
                    "read": false,
                  },
                ],
                [
                  "cody.completion",
                  "suggested",
                  {
                    "read": true,
                  },
                ],
              ]
            `)
        })

        /**
         * Scenario:
         * R1----------
         *     ^Stale (not suggested)
         *     R2------
         *            ^Synthesised from R1 result
         *            ^Marked for suggestion (with matching logId)
         *                     ^Suggested (when `logSuggestionEvents` is eventually called)
         */
        it('handles two parallel requests, by marking the old one as stale and only suggesting the final one', async () => {
            vi.useFakeTimers()
            const logSpy: MockInstance = vi.spyOn(telemetryRecorder, 'recordEvent')
            const provider = getInlineCompletionProvider()

            const { resolve: resolve1 } = createCompletion('console.█', provider)
            const { resolve: resolve2 } = createCompletion('console.log(█', provider)

            const [result1, result2] = await Promise.all([
                resolve1("log('hello')", { duration: 100, delay: 0 }),
                resolve2("'hello')", { duration: 150, delay: 0 }),
                vi.advanceTimersByTimeAsync(150), // Enough for both to be shown
            ])

            // Result 1 is marked as stale
            expect(result1).toBeNull()
            // Result 2 is used
            expect(result2).toBeDefined()

            // Enough for completion events to be logged
            vi.advanceTimersByTime(1000)
            CompletionLogger.logSuggestionEvents(true)

            expect(getAnalyticEventCalls(logSpy)).toMatchInlineSnapshot(`
              [
                [
                  "cody.completion",
                  "synthesizedFromParallelRequest",
                ],
                [
                  "cody.completion",
                  "suggested",
                  {
                    "read": true,
                  },
                ],
              ]
            `)
        })

        /**
         * Scenario:
         * R1-----------------
         *            ^Stale (not suggested)
         *            R2------
         *                   ^Synthesised from R1 result
         *                   ^Marked for suggestion (with matching logId)
         *                         ^Suggested (when `logSuggestionEvents` is eventually called)
         *               R3---
         *                   ^Synthesised from R1 result
         *                   ^Marked for suggestion (with matching logId). Will not be suggested as R2 will be suggested first.
         */
        it('handles multiple parallel requests, by marking the old one as stale and only suggesting one of the remaining ones', async () => {
            vi.useFakeTimers()
            const logSpy: MockInstance = vi.spyOn(telemetryRecorder, 'recordEvent')
            const provider = getInlineCompletionProvider()

            const { resolve: resolve1 } = createCompletion('console.█', provider)
            const { resolve: resolve2 } = createCompletion('console.log(█', provider)
            const { resolve: resolve3 } = createCompletion("console.log('h█", provider)

            const [result1, result2, result3] = await Promise.all([
                // The first completion will be triggered immediately, but takes a while to resolve
                resolve1("log('hello')", {
                    delay: 0,
                    duration: 800, // Ensure that this request is still in-flight when the next one starts
                }),
                // The second completion will be triggered before the first completion resolves, but also takes a while to resolve
                resolve2("'hello')", {
                    delay: 300, // Ensure that this request is made in-flight, as it bypasses the smart-throttle timeout
                    duration: 800,
                }),
                // The third completion will be triggered before both the first and second completions resolve.
                // It should be the only one that is suggested.
                resolve3("ello')", {
                    delay: 400, // Ensure that this request is made in-flight, as it bypasses the smart-throttle timeout
                    duration: 800,
                }),
                vi.advanceTimersByTimeAsync(2000), // Enough for all to be shown
            ])

            // Result 1 is marked as stale
            expect(result1).toBeNull()
            // Result 2 is used
            expect(result2).toBeDefined()
            // Result 3 is used
            expect(result3).toBeDefined()

            // Enough for completion events to be logged
            vi.advanceTimersByTime(1000)
            CompletionLogger.logSuggestionEvents(true)

            expect(getAnalyticEventCalls(logSpy)).toMatchInlineSnapshot(`
              [
                [
                  "cody.completion",
                  "synthesizedFromParallelRequest",
                ],
                [
                  "cody.completion",
                  "synthesizedFromParallelRequest",
                ],
                [
                  "cody.completion",
                  "suggested",
                  {
                    "read": true,
                  },
                ],
              ]
            `)
        })
    })
})

describe('InlineCompletionItemProvider preloading', () => {
    const autocompleteConfig = {
        autocompleteExperimentalPreloadDebounceInterval: 150,
        autocompleteAdvancedProvider: 'fireworks',
    } satisfies Partial<ClientConfiguration>

    const onDidChangeTextEditorSelection = vi.spyOn(vsCodeMocks.window, 'onDidChangeTextEditorSelection')

    beforeEach(() => {
        onDidChangeTextEditorSelection.mockClear()

        vi.useFakeTimers()

        initCompletionProviderConfig({ configuration: { configuration: autocompleteConfig, auth: {} } })
        mockLocalStorage()

        vi.spyOn(contextFiltersProvider, 'isUriIgnored').mockResolvedValue(false)
    })

    it('triggers preload request on cursor movement if cursor is at the end of a line', async () => {
        const autocompleteParams = params('console.log(█', [], {
            configuration: { configuration: autocompleteConfig, auth: {} },
        })

        const { document, position } = autocompleteParams
        const provider = getInlineCompletionProvider(autocompleteParams)
        await vi.runOnlyPendingTimersAsync()
        const provideCompletionSpy = vi.spyOn(provider, 'provideInlineCompletionItems')
        await nextTick()

        const [handler] = onDidChangeTextEditorSelection.mock.calls[0] as any

        // Simulate a cursor movement event
        await handler({
            textEditor: { document },
            selections: [new vsCodeMocks.Selection(position, position)],
        })

        expect(provideCompletionSpy).not.toBeCalled()
        await vi.advanceTimersByTimeAsync(50)
        expect(provideCompletionSpy).not.toBeCalled()

        await vi.advanceTimersByTimeAsync(
            autocompleteConfig.autocompleteExperimentalPreloadDebounceInterval - 50
        )

        expect(provideCompletionSpy).toBeCalledWith(
            document,
            position,
            expect.objectContaining({ isPreload: true })
        )
    })

    it('does not trigger preload request if current line has non-empty suffix', async () => {
        const autocompleteParams = params('console.log(█);', [], {
            configuration: { configuration: autocompleteConfig, auth: {} },
        })

        const { document, position } = autocompleteParams
        const provider = getInlineCompletionProvider(autocompleteParams)
        await vi.runOnlyPendingTimersAsync()
        const provideCompletionSpy = vi.spyOn(provider, 'provideInlineCompletionItems')
        const [handler] = onDidChangeTextEditorSelection.mock.lastCall as any

        // Simulate a cursor movement event
        await handler({
            textEditor: { document },
            selections: [new vsCodeMocks.Selection(position, position)],
        })

        await vi.advanceTimersByTimeAsync(
            autocompleteConfig.autocompleteExperimentalPreloadDebounceInterval
        )
        expect(provideCompletionSpy).not.toHaveBeenCalled()
    })

    it('triggers preload request on next empty line if current line has non-empty suffix', async () => {
        const autocompleteParams = params('console.log(█);\n', [], {
            configuration: { configuration: autocompleteConfig },
        })

        const { document, position } = autocompleteParams
        const provider = getInlineCompletionProvider(autocompleteParams)
        await vi.runOnlyPendingTimersAsync()
        const provideCompletionSpy = vi.spyOn(provider, 'provideInlineCompletionItems')
        const [handler] = onDidChangeTextEditorSelection.mock.calls[0] as any

        await handler({
            textEditor: { document },
            selections: [new vsCodeMocks.Selection(position, position)],
        })

        await vi.advanceTimersByTimeAsync(
            autocompleteConfig.autocompleteExperimentalPreloadDebounceInterval
        )
        expect(provideCompletionSpy).toBeCalledWith(
            document,
            position.with({ line: position.line + 1, character: 0 }),
            expect.objectContaining({ isPreload: true })
        )
    })

    it('does not trigger preload request if next line is not empty', async () => {
        const autocompleteParams = params('console.log(█);\nconsole.log()', [], {
            configuration: { configuration: autocompleteConfig },
        })

        const { document, position } = autocompleteParams
        const provider = getInlineCompletionProvider(autocompleteParams)
        await vi.runOnlyPendingTimersAsync()
        const provideCompletionSpy = vi.spyOn(provider, 'provideInlineCompletionItems')
        const [handler] = onDidChangeTextEditorSelection.mock.lastCall as any

        await handler({
            textEditor: { document },
            selections: [new vsCodeMocks.Selection(position, position)],
        })

        await vi.advanceTimersByTimeAsync(
            autocompleteConfig.autocompleteExperimentalPreloadDebounceInterval
        )
        expect(provideCompletionSpy).not.toHaveBeenCalled()
    })
})
