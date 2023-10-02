import dedent from 'dedent'
import { describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import { FeatureFlagProvider } from '@sourcegraph/cody-shared/src/experimentation/FeatureFlagProvider'
import { RateLimitError } from '@sourcegraph/cody-shared/src/sourcegraph-api/errors'
import { SourcegraphGraphQLAPIClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/graphql'

import { localStorage } from '../services/LocalStorageProvider'
import { vsCodeMocks } from '../testutils/mocks'

import { getCurrentDocContext } from './get-current-doc-context'
import { getInlineCompletions, InlineCompletionsResultSource } from './get-inline-completions'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import * as CompletionLogger from './logger'
import { SuggestionID } from './logger'
import { createProviderConfig } from './providers/anthropic'
import { RequestParams } from './request-manager'
import { documentAndPosition } from './test-helpers'
import { InlineCompletionItem } from './types'

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
            completeSuggestWidgetSelection: true,
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
            }),
            featureFlagProvider: dummyFeatureFlagProvider,
            triggerNotice: null,

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
            logId: '1' as SuggestionID,
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
            logId: '1' as SuggestionID,
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
            "lastTriggerDocContext": {
              "contextRange": Range {
                "end": Position {
                  "character": 14,
                  "line": 2,
                },
                "start": Position {
                  "character": 0,
                  "line": 0,
                },
              },
              "currentLinePrefix": "const foo = ",
              "currentLineSuffix": "",
              "multilineTrigger": null,
              "nextNonEmptyLine": "console.log(1)",
              "prefix": "const foo = ",
              "prevNonEmptyLine": "",
              "suffix": "
          console.log(1)
          console.log(2)",
            },
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
              "source": "Network",
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
            const requestParams: RequestParams = {
                document,
                position,
                docContext: getCurrentDocContext({
                    document,
                    position,
                    maxSuffixLength: 100,
                    maxPrefixLength: 100,
                    enableExtendedTriggers: true,
                }),
                selectedCompletionInfo: undefined,
            }

            const logId = '1' as SuggestionID
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId,
                items: [{ insertText: 'bar', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const triggerNotice = vi.fn()
            const provider = new MockableInlineCompletionItemProvider(fn, {
                triggerNotice,
            })
            const completions = await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
            expect(completions).not.toBeNull()
            expect(completions?.items).not.toHaveLength(0)

            // Shuldn't have been called yet.
            expect(triggerNotice).not.toHaveBeenCalled()

            // Called on first accept.
            provider.handleDidAcceptCompletionItem(logId, completions?.items[0] as InlineCompletionItem, requestParams)
            expect(triggerNotice).toHaveBeenCalledOnce()
            expect(triggerNotice).toHaveBeenCalledWith({ key: 'onboarding-autocomplete' })

            // Not called on second accept.
            provider.handleDidAcceptCompletionItem(logId, completions?.items[0] as InlineCompletionItem, requestParams)
            expect(triggerNotice).toHaveBeenCalledOnce()
        })
    })

    describe('logger', () => {
        it('logs a completion as shown', async () => {
            const spy = vi.spyOn(CompletionLogger, 'suggested')

            const { document, position } = documentAndPosition('const foo = █', 'typescript')
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1' as SuggestionID,
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
                    logId: '1' as SuggestionID,
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
                logId: '1' as SuggestionID,
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
                logId: '1' as SuggestionID,
                items: [{ insertText: '2] ;', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
            await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)

            expect(spy).toHaveBeenCalled()
        })

        it('log a completion if the suffix is inside the completion in CRLF format', async () => {
            const spy = vi.spyOn(CompletionLogger, 'suggested')

            const { document, position } = documentAndPosition(
                'const a = [1, █];\r\nconsol.log(1234);\r\n',
                'typescript'
            )
            const fn = vi.fn(getInlineCompletions).mockResolvedValue({
                logId: '1' as SuggestionID,
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
                logId: '1' as SuggestionID,
                items: [{ insertText: '2];', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
            await provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)

            expect(spy).not.toHaveBeenCalled()
        })
    })

    describe('completeSuggestWidgetSelection', () => {
        it('does not append the current selected widget item to the doc context on a new request', async () => {
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
                logId: '1' as SuggestionID,
                items: [{ insertText: "('hello world!')", range: new vsCodeMocks.Range(1, 12, 1, 13) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
            const items = await provider.provideInlineCompletionItems(document, position, {
                triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
                selectedCompletionInfo: { text: 'log', range: new vsCodeMocks.Range(1, 12, 1, 13) },
            })

            expect(fn).toBeCalledWith(
                expect.objectContaining({
                    docContext: expect.objectContaining({
                        prefix: 'function foo() {\n    console.l',
                        suffix: '\n    console.foo()\n}',
                        currentLinePrefix: '    console.l',
                        currentLineSuffix: '',
                        nextNonEmptyLine: '    console.foo()',
                        prevNonEmptyLine: 'function foo() {',
                    }),
                })
            )
            expect(items).toBe(null)
        })

        it('appends the current selected widget item to the doc context for the completer and removes the injected prefix from the result when the context item was changed', async () => {
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
                logId: '1' as SuggestionID,
                items: [{ insertText: "('hello world!')", range: new vsCodeMocks.Range(1, 12, 1, 13) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)

            // Ignore the first call, it will not use the selected completion info
            await provider.provideInlineCompletionItems(document, position, {
                triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
                selectedCompletionInfo: { text: 'dir', range: new vsCodeMocks.Range(1, 12, 1, 13) },
            })
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
                logId: '1' as SuggestionID,
                items: [{ insertText: 'dir', range: new vsCodeMocks.Range(position, position) }],
                source: InlineCompletionsResultSource.Network,
            })

            const provider = new MockableInlineCompletionItemProvider(fn)
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
