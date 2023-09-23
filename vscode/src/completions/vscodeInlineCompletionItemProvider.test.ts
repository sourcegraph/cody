import dedent from 'dedent'
import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { RateLimitError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'

import { localStorage } from '../services/LocalStorageProvider'
import { vsCodeMocks } from '../testutils/mocks'

import { getInlineCompletions, InlineCompletionsResultSource } from './getInlineCompletions'
import * as CompletionLogger from './logger'
import { createProviderConfig } from './providers/anthropic'
import { documentAndPosition } from './test-helpers'
import { InlineCompletionItem } from './types'
import { InlineCompletionItemProvider } from './vscodeInlineCompletionItemProvider'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    workspace: {
        ...vsCodeMocks.workspace,

        onDidChangeTextDocument() {
            return null
        },
    },
    window: {
        ...vsCodeMocks.window,
        visibleTextEditors: [],
        tabGroups: { all: [] },
    },
}))

const DUMMY_CONTEXT: vscode.InlineCompletionContext = {
    selectedCompletionInfo: undefined,
    triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
}

const dummyFeatureFlagProvider = new FeatureFlagProvider(
    new SourcegraphGraphQLAPIClient({
        accessToken: 'access-token',
        serverEndpoint: 'https://sourcegraph.com',
        customHeaders: {},
    })
)

class MockableInlineCompletionItemProvider extends InlineCompletionItemProvider {
    constructor(
        mockGetInlineCompletions: typeof getInlineCompletions,
        superArgs?: Partial<ConstructorParameters<typeof InlineCompletionItemProvider>[0]>
    ) {
        super({
            completeSuggestWidgetSelection: false,
            // Most of these are just passed directly to `getInlineCompletions`, which we've mocked, so
            // we can just make them `null`.
            //
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            getCodebaseContext: null as any,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            history: null as any,
            // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
            statusBar: null as any,
            providerConfig: createProviderConfig({
                // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-explicit-any
                client: null as any,
                contextWindowTokens: 2048,
            }),
            featureFlagProvider: dummyFeatureFlagProvider,
            sidebarChatProvider: null,

            ...superArgs,
        })
        this.getInlineCompletions = mockGetInlineCompletions
    }

    public declare lastCandidate
}

describe('InlineCompletionItemProvider', () => {
    it('returns results that span the whole line', async () => {
        const { document, position } = documentAndPosition('const foo = █', 'typescript')
        const fn = vi.fn(getInlineCompletions).mockResolvedValue({
            logId: '1',
            items: [{ insertText: 'test', range: new vsCodeMocks.Range(position, position) }],
            source: InlineCompletionsResultSource.Network,
        })
        const provider = new MockableInlineCompletionItemProvider(fn)
        const result = await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
        expect(result).not.toBeNull()
        expect(result!.items).toMatchInlineSnapshot(`
          [
            InlineCompletionItem {
              "insertText": "const foo = test",
              "range": Range {
                "end": Position {
                  "character": 12,
                  "line": 0,
                },
                "start": Position {
                  "character": 0,
                  "line": 0,
                },
              },
            },
          ]
        `)
    })

    it('saves lastInlineCompletionResult', async () => {
        const { document, position } = documentAndPosition(
            dedent`
                const foo = █
                console.log(1)
                console.log(2)
            `,
            'typescript'
        )

        const item: InlineCompletionItem = { insertText: 'test', range: new vsCodeMocks.Range(position, position) }
        const fn = vi.fn(getInlineCompletions).mockResolvedValue({
            logId: '1',
            items: [item],
            source: InlineCompletionsResultSource.Network,
        })
        const provider = new MockableInlineCompletionItemProvider(fn)

        // Initially it is undefined.
        expect(provider.lastCandidate).toBeUndefined()

        // No lastInlineCompletionResult is provided on the 1st call.
        await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
        expect(fn.mock.calls.map(call => call[0].lastCandidate)).toEqual([undefined])
        fn.mockReset()

        // But it is returned and saved.
        expect(provider.lastCandidate).toMatchInlineSnapshot(`
          {
            "lastTriggerCurrentLinePrefix": "const foo = ",
            "lastTriggerNextNonEmptyLine": "console.log(1)",
            "lastTriggerPosition": Position {
              "character": 12,
              "line": 0,
            },
            "lastTriggerSelectedInfoItem": undefined,
            "result": {
              "items": [
                {
                  "insertText": "test",
                  "range": Range {
                    "end": Position {
                      "character": 12,
                      "line": 0,
                    },
                    "start": Position {
                      "character": 12,
                      "line": 0,
                    },
                  },
                },
              ],
              "logId": "1",
            },
            "uri": {
              "$mid": 1,
              "path": "/test.ts",
              "scheme": "file",
            },
          }
        `)

        // On the 2nd call, lastInlineCompletionResult is provided.
        await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
        expect(fn.mock.calls.map(call => call[0].lastCandidate?.result.items)).toEqual([[item]])
    })

    describe('onboarding', () => {
        // Set up local storage backed by an object. Local storage is used to
        // track whether a completion was accepted for the first time.
        const localStorageData: { [key: string]: unknown } = {}
        localStorage.setStorage({
            get: (key: string) => localStorageData[key],
            update: (key: string, value: unknown) => (localStorageData[key] = value),
        } as any as vscode.Memento)

        it('triggers notice the first time an inline complation is accepted', async () => {
            const { document, position } = documentAndPosition('const foo = █', 'typescript')
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1',
                items: [{ insertText: 'bar', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })
            const mockChatView = {
                triggerNotice() {}, // eslint-disable-line @typescript-eslint/no-empty-function
            }
            const spy = vi.spyOn(mockChatView, 'triggerNotice')

            const provider = new MockableInlineCompletionItemProvider(fn, {
                sidebarChatProvider: mockChatView as any,
            })
            const completions = await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
            expect(completions).not.toBeNull()
            expect(completions?.items).not.toHaveLength(0)

            // Shuldn't have been called yet.
            expect(spy).not.toHaveBeenCalled()

            // Called on first accept.
            provider.handleDidAcceptCompletionItem('1', completions?.items[0] as InlineCompletionItem)
            expect(spy).toHaveBeenCalledOnce()
            expect(spy).toHaveBeenCalledWith({ key: 'onboarding-autocomplete' })

            // Not called on second accept.
            provider.handleDidAcceptCompletionItem('1', completions?.items[0] as InlineCompletionItem)
            expect(spy).toHaveBeenCalledOnce()
        })
    })

    describe('logger', () => {
        it('logs a completion as shown', async () => {
            const spy = vi.spyOn(CompletionLogger, 'suggested')

            const { document, position } = documentAndPosition('const foo = █', 'typescript')
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1',
                items: [{ insertText: 'bar', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
            await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)

            expect(spy).toHaveBeenCalled()
        })

        it('does not log a completion when the abort handler was triggered after a network fetch', async () => {
            const spy = vi.spyOn(CompletionLogger, 'suggested')

            let onCancel = () => {}
            const token: vscode.CancellationToken = {
                isCancellationRequested: false,
                onCancellationRequested(fn: any): vscode.Disposable {
                    onCancel = fn
                    return { dispose: () => {} }
                },
            }
            function cancel() {
                token.isCancellationRequested = true
                onCancel()
            }

            const { document, position } = documentAndPosition('const foo = █', 'typescript')
            const fn = vi.fn(getInlineCompletions).mockImplementation(() => {
                cancel()
                return Promise.resolve({
                    logId: '1',
                    items: [{ insertText: 'bar', range: new vsCodeMocks.Range(position, position) }],
                    source: InlineCompletionsResultSource.Network,
                })
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
            await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT, token)

            expect(spy).not.toHaveBeenCalled()
        })

        it('does not log a completion if it does not overlap the completion popup', async () => {
            const spy = vi.spyOn(CompletionLogger, 'suggested')

            const { document, position } = documentAndPosition('console.█', 'typescript')
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1',
                items: [{ insertText: 'log()', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
            await provider.provideInlineCompletionItems(document, position, {
                triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
                selectedCompletionInfo: { text: 'dir', range: new vsCodeMocks.Range(0, 8, 0, 8) },
            })

            expect(spy).not.toHaveBeenCalled()
        })

        it('log a completion if the suffix is inside the completion', async () => {
            const spy = vi.spyOn(CompletionLogger, 'suggested')

            const { document, position } = documentAndPosition('const a = [1, █];', 'typescript')
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1',
                items: [{ insertText: '2] ;', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
            await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)

            expect(spy).toHaveBeenCalled()
        })

        it('does not log a completion if the suffix does not match', async () => {
            const spy = vi.spyOn(CompletionLogger, 'suggested')

            const { document, position } = documentAndPosition('const a = [1, █)(123);', 'typescript')
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1',
                items: [{ insertText: '2];', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
            await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)

            expect(spy).not.toHaveBeenCalled()
        })
    })

    describe('completeSuggestWidgetSelection', () => {
        it('appends the current selected widget item to the doc context for the completer and removes the injected prefix from the result', async () => {
            const { document, position } = documentAndPosition(
                dedent`
                    function foo() {
                        console.l█
                        console.foo()
                    }
                `,
                'typescript'
            )
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1',
                items: [{ insertText: "('hello world!')", range: new vsCodeMocks.Range(1, 12, 1, 13) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn, { completeSuggestWidgetSelection: true })
            const items = await provider.provideInlineCompletionItems(document, position, {
                triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
                selectedCompletionInfo: { text: 'log', range: new vsCodeMocks.Range(1, 12, 1, 13) },
            })

            expect(fn).toBeCalledWith(
                expect.objectContaining({
                    docContext: expect.objectContaining({
                        prefix: 'function foo() {\n    console.log',
                        suffix: '\n    console.foo()\n}',
                        currentLinePrefix: '    console.log',
                        currentLineSuffix: '',
                        nextNonEmptyLine: '    console.foo()',
                        prevNonEmptyLine: 'function foo() {',
                    }),
                })
            )
            expect(items).toMatchInlineSnapshot(`
              {
                "completionEvent": undefined,
                "items": [
                  InlineCompletionItem {
                    "insertText": "    console.log('hello world!')",
                    "range": Range {
                      "end": Position {
                        "character": 13,
                        "line": 1,
                      },
                      "start": Position {
                        "character": 0,
                        "line": 1,
                      },
                    },
                  },
                ],
              }
            `)
        })

        it('does not trigger a completion request if the current document context would not allow a suggestion to be shown', async () => {
            // This case happens when the selected item in the dropdown does not start with the
            // exact characters that are already in the document.
            // Here, the user has `console.l` in the document but the selected item is `dir`. There
            // is no way to trigger an inline completion in VS Code for this scenario right now so
            // we skip the request entirely.
            const { document, position } = documentAndPosition(
                dedent`
                    function foo() {
                        console.l█
                        console.foo()
                    }
                `,
                'typescript'
            )
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1',
                items: [{ insertText: 'dir', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn, { completeSuggestWidgetSelection: true })
            const items = await provider.provideInlineCompletionItems(document, position, {
                triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
                selectedCompletionInfo: { text: 'dir', range: new vsCodeMocks.Range(1, 12, 1, 13) },
            })

            expect(fn).not.toHaveBeenCalled()
            expect(items).toBe(null)
        })
    })

    describe('error reporting', () => {
        it('reports rate limit errors to the user once', async () => {
            const { document, position } = documentAndPosition('█')
            const fn = vi.fn(getInlineCompletions).mockRejectedValue(new RateLimitError('rate limited oh no', 1234))
            const addError = vi.fn()
            const provider = new MockableInlineCompletionItemProvider(fn, { statusBar: { addError } as any })

            await expect(provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)).rejects.toThrow(
                'rate limited oh no'
            )
            expect(addError).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Cody Autocomplete Disabled Due to Rate Limit',
                    description: "You've used all 1234 daily autocompletions.",
                })
            )

            await expect(provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)).rejects.toThrow(
                'rate limited oh no'
            )
            expect(addError).toHaveBeenCalledTimes(1)
        })

        it.skip('reports unexpected errors grouped by their message once', async () => {
            const { document, position } = documentAndPosition('█')
            let error = new Error('unexpected')
            const fn = vi.fn(getInlineCompletions).mockImplementation(() => Promise.reject(error))
            const addError = vi.fn()
            const provider = new MockableInlineCompletionItemProvider(fn, { statusBar: { addError } as any })

            await expect(provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)).rejects.toThrow(
                'unexpected'
            )
            expect(addError).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Cody Autocomplete Encountered an Unexpected Error',
                    description: 'unexpected',
                })
            )

            await expect(provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)).rejects.toThrow(
                'unexpected'
            )
            expect(addError).toHaveBeenCalledTimes(1)

            error = new Error('different')
            await expect(provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)).rejects.toThrow(
                'different'
            )
            expect(addError).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Cody Autocomplete Encountered an Unexpected Error',
                    description: 'different',
                })
            )
        })
    })
})
