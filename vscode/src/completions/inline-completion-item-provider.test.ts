import dedent from 'dedent'
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import * as vscode from 'vscode'

import {
    type AuthStatus,
    type GraphQLAPIClientConfig,
    RateLimitError,
    contextFiltersProvider,
    graphqlClient,
} from '@sourcegraph/cody-shared'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { localStorage } from '../services/LocalStorageProvider'
import { DEFAULT_VSCODE_SETTINGS } from '../testutils/mocks'
import { withPosixPaths } from '../testutils/textDocument'
import { SupportedLanguage } from '../tree-sitter/grammars'
import { updateParseTreeCache } from '../tree-sitter/parse-tree-cache'
import { getParser, resetParsersCache } from '../tree-sitter/parser'
import {
    getInlineCompletions,
    getInlineCompletionsFullResponse,
    initCompletionProviderConfig,
    params,
} from './get-inline-completions-tests/helpers'
import { InlineCompletionItemProvider } from './inline-completion-item-provider'
import * as CompletionLogger from './logger'
import { createProviderConfig } from './providers/anthropic'
import { completion, initTreeSitterParser } from './test-helpers'

const DUMMY_CONTEXT: vscode.InlineCompletionContext = {
    selectedCompletionInfo: undefined,
    triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
}

const DUMMY_AUTH_STATUS: AuthStatus = {
    endpoint: 'https://fastsourcegraph.com',
    isDotCom: true,
    isLoggedIn: true,
    isFireworksTracingEnabled: false,
    showInvalidAccessTokenError: false,
    authenticated: true,
    hasVerifiedEmail: true,
    requiresVerifiedEmail: true,
    siteHasCodyEnabled: true,
    siteVersion: '1234',
    username: 'uwu',
    userCanUpgrade: false,
    codyApiVersion: 0,
}

graphqlClient.setConfig({} as unknown as GraphQLAPIClientConfig)

class MockableInlineCompletionItemProvider extends InlineCompletionItemProvider {
    constructor(
        mockGetInlineCompletions: typeof getInlineCompletions,
        superArgs?: Partial<ConstructorParameters<typeof InlineCompletionItemProvider>[0]>
    ) {
        super({
            completeSuggestWidgetSelection: true,
            // Most of these are just passed directly to `getInlineCompletions`, which we've mocked, so
            // we can just make them `null`.
            statusBar: null as any,
            providerConfig: createProviderConfig({
                client: null as any,
            }),
            authStatus: DUMMY_AUTH_STATUS,
            firstCompletionTimeout:
                superArgs?.firstCompletionTimeout ??
                DEFAULT_VSCODE_SETTINGS.autocompleteFirstCompletionTimeout,
            ...superArgs,
        })
        this.getInlineCompletions = mockGetInlineCompletions as typeof this.getInlineCompletions
    }

    public declare lastCandidate
}

describe('InlineCompletionItemProvider', () => {
    beforeAll(async () => {
        await initCompletionProviderConfig({})

        // Dummy noop implementation of localStorage.
        localStorage.setStorage({
            get: () => null,
            update: () => {},
        } as any as vscode.Memento)
    })
    beforeEach(() => {
        vi.spyOn(contextFiltersProvider.instance!, 'isUriIgnored').mockResolvedValue(false)
        CompletionLogger.reset_testOnly()
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    it('returns results that span the whole line', async () => {
        const completionParams = params('const foo = █', [completion`test`])
        const provider = new MockableInlineCompletionItemProvider(() =>
            getInlineCompletions(completionParams)
        )
        const result = await provider.provideInlineCompletionItems(
            completionParams.document,
            completionParams.position,
            DUMMY_CONTEXT
        )
        expect(result).not.toBeNull()
        expect(result!.items.map(item => item.range)).toMatchInlineSnapshot(`
          [
            Range {
              "end": Position {
                "character": 12,
                "line": 0,
              },
              "start": Position {
                "character": 0,
                "line": 0,
              },
            },
          ]
        `)
    })

    it('prevents completions inside comments', async () => {
        try {
            const completionParams = params('// █', [completion`test`])

            await initTreeSitterParser()
            const parser = getParser(SupportedLanguage.typescript)
            if (parser) {
                updateParseTreeCache(completionParams.document, parser)
            }

            const fn = vi.fn()
            const provider = new MockableInlineCompletionItemProvider(fn, {
                disableInsideComments: true,
            })
            const result = await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT
            )
            expect(result).toBeNull()
            expect(fn).not.toHaveBeenCalled()
        } finally {
            resetParsersCache()
        }
    })

    it('saves lastInlineCompletionResult', async () => {
        const completionParams = params(
            dedent`
                const foo = █
                console.log(1)
                console.log(2)
            `,
            [completion`test`]
        )
        const fn = vi.fn().mockResolvedValue(getInlineCompletions(completionParams))
        const provider = new MockableInlineCompletionItemProvider(fn)

        // Initially it is undefined.
        expect(provider.lastCandidate).toBeUndefined()

        // No lastInlineCompletionResult is provided on the 1st call.
        await provider.provideInlineCompletionItems(
            completionParams.document,
            completionParams.position,
            DUMMY_CONTEXT
        )
        expect(fn.mock.calls.map(call => call[0].lastCandidate)).toEqual([undefined])
        fn.mockReset()

        // But it is returned and saved.
        expect(withPosixPaths(provider.lastCandidate!)).toMatchInlineSnapshot(`
          {
            "lastTriggerDocContext": {
              "currentLinePrefix": "const foo = ",
              "currentLineSuffix": "",
              "injectedPrefix": null,
              "maxPrefixLength": 4300,
              "maxSuffixLength": 716,
              "multilineTrigger": null,
              "multilineTriggerPosition": null,
              "nextNonEmptyLine": "console.log(1)",
              "position": Position {
                "character": 12,
                "line": 0,
              },
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
            "lastTriggerSelectedCompletionInfo": undefined,
            "result": {
              "items": [
                {
                  "insertText": "test",
                  "nodeTypes": undefined,
                  "nodeTypesWithCompletion": undefined,
                  "range": undefined,
                  "resolvedModel": undefined,
                  "responseHeaders": undefined,
                },
              ],
              "source": "Network",
              "stale": undefined,
            },
            "uri": {
              "$mid": 1,
              "path": "/test.ts",
              "scheme": "file",
            },
          }
        `)

        // On the 2nd call, lastInlineCompletionResult is provided.
        await provider.provideInlineCompletionItems(
            completionParams.document,
            completionParams.position,
            DUMMY_CONTEXT
        )
        expect(fn.mock.calls.map(call => call[0].lastCandidate?.result.items)).toMatchInlineSnapshot(`
          [
            [
              {
                "insertText": "test",
                "nodeTypes": undefined,
                "nodeTypesWithCompletion": undefined,
                "range": undefined,
                "resolvedModel": undefined,
                "responseHeaders": undefined,
              },
            ],
          ]
        `)
    })

    it('no-ops on files that are ignored by the context filter policy', async () => {
        vi.spyOn(contextFiltersProvider.instance!, 'isUriIgnored').mockResolvedValueOnce('repo:foo')
        const completionParams = params('const foo = █', [completion`bar`])
        const fn = vi.fn()
        const provider = new MockableInlineCompletionItemProvider(fn)
        const completions = await provider.provideInlineCompletionItems(
            completionParams.document,
            completionParams.position,
            DUMMY_CONTEXT
        )
        expect(completions).toBe(null)
        expect(fn).not.toHaveBeenCalled()
    })

    describe('logger', () => {
        it('logs a completion as shown', async () => {
            const spy = vi.spyOn(CompletionLogger, 'prepareSuggestionEvent')

            const completionParams = params('const foo = █', [completion`bar`])
            const provider = new MockableInlineCompletionItemProvider(() =>
                getInlineCompletions(completionParams)
            )
            await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT
            )

            expect(spy).toHaveBeenCalled()
        })

        it('does not log a completion when the abort handler was triggered after a network fetch', async () => {
            const spy = vi.spyOn(CompletionLogger, 'prepareSuggestionEvent')

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

            const completionParams = params('const foo = █', [completion`bar`])
            const provider = new MockableInlineCompletionItemProvider(() => {
                cancel()
                return getInlineCompletions(completionParams)
            })
            await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT,
                token
            )

            expect(spy).not.toHaveBeenCalled()
        })

        it('does not log a completion if it does not overlap the completion popup', async () => {
            const spy = vi.spyOn(CompletionLogger, 'prepareSuggestionEvent')

            const completionParams = params('console.█', [completion`log()`])
            const provider = new MockableInlineCompletionItemProvider(() =>
                getInlineCompletions(completionParams)
            )
            await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                {
                    triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
                    selectedCompletionInfo: { text: 'dir', range: new vscode.Range(0, 8, 0, 8) },
                }
            )

            expect(spy).not.toHaveBeenCalled()
        })

        it('log a completion if the suffix is inside the completion', async () => {
            const spy = vi.spyOn(CompletionLogger, 'prepareSuggestionEvent')

            const completionParams = params('const a = [1, █];', [completion`2] ;`])
            const provider = new MockableInlineCompletionItemProvider(() =>
                getInlineCompletions(completionParams)
            )
            await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT
            )

            expect(spy).toHaveBeenCalled()
        })

        it('log a completion if the suffix is inside the completion in CRLF format', async () => {
            const spy = vi.spyOn(CompletionLogger, 'prepareSuggestionEvent')

            const completionParams = params('const a = [1, █];\r\nconsol.log(1234);\r\n', [
                completion`2] ;`,
            ])
            const provider = new MockableInlineCompletionItemProvider(() =>
                getInlineCompletions(completionParams)
            )
            await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT
            )

            expect(spy).toHaveBeenCalled()
        })

        it('does not log a completion if the suffix does not match', async () => {
            const spy = vi.spyOn(CompletionLogger, 'prepareSuggestionEvent')

            const completionParams = params('const a = [1, █)(123);', [completion`2];`])
            const provider = new MockableInlineCompletionItemProvider(() =>
                getInlineCompletions(params('const a = [1, █)(123);', [completion`2];`]))
            )
            await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT
            )

            expect(spy).not.toHaveBeenCalled()
        })

        it('does not log a completion if it is marked as stale', async () => {
            const spy = vi.spyOn(CompletionLogger, 'prepareSuggestionEvent')

            const completionParams = params('const foo = █', [completion`bar`])
            const provider = new MockableInlineCompletionItemProvider(async () => {
                const result = await getInlineCompletions(completionParams)
                if (result) {
                    result.stale = true
                }
                return result
            })

            await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT
            )

            expect(spy).not.toHaveBeenCalled()
        })

        it('does not log a completion if the prefix no longer matches due to a cursor change', async () => {
            const spy = vi.spyOn(CompletionLogger, 'prepareSuggestionEvent')

            // Ensure the mock returns a completion item that requires the original
            // prefix to be present.
            const completionParams = params('const foo = █a', [completion`bar`])

            // Update the cursor position to be after the expected completion request
            const cursorSelectionMock = vi
                .spyOn(vscode.window, 'activeTextEditor', 'get')
                .mockReturnValue({
                    selection: {
                        active: completionParams.position.with(
                            completionParams.position.line,
                            completionParams.position.character + 1
                        ),
                    },
                } as any)

            // Call provideInlineCompletionItems with the initial `completionParams`. This will trigger a completion request
            // but by the time it resolves, the cursor position will have changed. Meaning the prefix is no longer
            // valid and this completion should not be suggested.
            new MockableInlineCompletionItemProvider(() =>
                getInlineCompletions(completionParams)
            ).provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT
            )

            // The completion is no longer visible due to the prefix changing before the request resolved.
            expect(spy).toHaveBeenCalledTimes(0)
            cursorSelectionMock.mockReset()
        })

        describe('timer based', () => {
            it('logs a completion after 750ms', async () => {
                vi.useFakeTimers()
                const spy = vi.spyOn(telemetryRecorder, 'recordEvent')

                const completionParams = params('const foo = █', [completion`bar`])
                vi.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
                    ...vscode.window.activeTextEditor,
                    document: completionParams.document,
                    selection: { active: completionParams.position },
                } as any)

                const provider = new MockableInlineCompletionItemProvider(() =>
                    getInlineCompletionsFullResponse(completionParams)
                )

                await provider.provideInlineCompletionItems(
                    completionParams.document,
                    completionParams.position,
                    DUMMY_CONTEXT
                )

                vi.advanceTimersByTime(500)
                expect(spy).toHaveBeenCalledTimes(0) // Not waited long enough

                vi.advanceTimersByTime(250) // 500 + 250 = 750ms (time until completion is considered visible)
                CompletionLogger.logSuggestionEvents(true)
                expect(spy).toHaveBeenCalledTimes(1)
                expect(spy).toHaveBeenCalledWith(
                    'cody.completion',
                    'suggested',
                    expect.objectContaining({ metadata: expect.objectContaining({ read: 1 }) })
                )
            })

            it('does not log a completion if it is hidden due to a cursor position change after 750ms', async () => {
                vi.useFakeTimers()
                const spy = vi.spyOn(telemetryRecorder, 'recordEvent')

                const completionParams = params('const foo = █\nconst other =', [completion`bar`])

                const provider = new MockableInlineCompletionItemProvider(() =>
                    getInlineCompletionsFullResponse(completionParams)
                )

                await provider.provideInlineCompletionItems(
                    completionParams.document,
                    completionParams.position,
                    DUMMY_CONTEXT
                )

                vi.advanceTimersByTime(500) // 500ms has passed, now let us modify the cursor position
                vi.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
                    ...vscode.window.activeTextEditor,
                    document: completionParams.document,
                    selection: {
                        active: new vscode.Position(completionParams.position.line + 1, 0),
                    },
                } as any)

                vi.advanceTimersByTime(250) // 500 + 250 = 750ms (time until completion is considered visible)
                CompletionLogger.logSuggestionEvents(true)
                expect(spy).toHaveBeenCalledTimes(1)
                expect(spy).toHaveBeenCalledWith(
                    'cody.completion',
                    'suggested',
                    expect.objectContaining({ metadata: expect.objectContaining({ read: 0 }) })
                )
            })

            it('does not log a completion if it is hidden due to a document change after 750ms', async () => {
                vi.useFakeTimers()
                const spy = vi.spyOn(telemetryRecorder, 'recordEvent')

                const completionParams = params('const foo = █', [completion`bar`])

                const provider = new MockableInlineCompletionItemProvider(() =>
                    getInlineCompletionsFullResponse(completionParams)
                )

                await provider.provideInlineCompletionItems(
                    completionParams.document,
                    completionParams.position,
                    DUMMY_CONTEXT
                )

                vi.advanceTimersByTime(500) // 500ms has passed, now let us modify the document uri
                vi.spyOn(vscode.window, 'activeTextEditor', 'get').mockReturnValue({
                    ...vscode.window.activeTextEditor,
                    document: {
                        ...completionParams.document,
                        uri: { toString: () => 'some-other-uri' },
                    },
                } as any)

                vi.advanceTimersByTime(250) // 500 + 250 = 750ms (time until completion is considered visible)
                CompletionLogger.logSuggestionEvents(true)
                expect(spy).toHaveBeenCalledTimes(1)
                expect(spy).toHaveBeenCalledWith(
                    'cody.completion',
                    'suggested',
                    expect.objectContaining({ metadata: expect.objectContaining({ read: 0 }) })
                )
            })
        })
    })

    describe('completeSuggestWidgetSelection', () => {
        it('does not append the current selected widget item to the doc context on a new request', async () => {
            const completionParams = params(
                dedent`
                    function foo() {
                        console.l█
                        console.foo()
                    }
                `,
                [completion`log`]
            )

            const fn = vi.fn().mockResolvedValue(getInlineCompletions(completionParams))
            const provider = new MockableInlineCompletionItemProvider(fn)
            const items = await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                {
                    triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
                    selectedCompletionInfo: { text: 'log', range: new vscode.Range(1, 12, 1, 13) },
                }
            )

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

        it('appends the current selected widget item to the doc context for the completer from the result when the context item was changed', async () => {
            const completionParams = params(
                dedent`
                    function foo() {
                        console.█
                        console.foo()
                    }
                `,
                [completion`log('hello world!')`]
            )

            const fn = vi.fn().mockResolvedValue(getInlineCompletions(completionParams))
            const provider = new MockableInlineCompletionItemProvider(fn)

            // Ignore the first call, it will not use the selected completion info
            await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                {
                    triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
                    selectedCompletionInfo: { text: 'dir', range: new vscode.Range(1, 12, 1, 12) },
                }
            )

            const items = await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                {
                    triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
                    selectedCompletionInfo: { text: 'log', range: new vscode.Range(1, 12, 1, 12) },
                }
            )

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
            expect(items?.items.map(item => item.analyticsItem)).toMatchInlineSnapshot(`
              [
                {
                  "insertText": "log('hello world!')",
                  "nodeTypes": undefined,
                  "nodeTypesWithCompletion": undefined,
                  "range": undefined,
                  "resolvedModel": undefined,
                  "responseHeaders": undefined,
                },
              ]
            `)
        })

        it('does not trigger a completion request if the current document context would not allow a suggestion to be shown', async () => {
            // This case happens when the selected item in the dropdown does not start with the
            // exact characters that are already in the document.
            // Here, the user has `console.l` in the document but the selected item is `dir`. There
            // is no way to trigger an inline completion in VS Code for this scenario right now so
            // we skip the request entirely.
            const completionParams = params(
                dedent`
                    function foo() {
                        console.l█
                        console.foo()
                    }
                `,
                [completion`dir`]
            )

            const fn = vi.fn().mockResolvedValue(getInlineCompletions(completionParams))
            const provider = new MockableInlineCompletionItemProvider(fn)
            const items = await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                {
                    triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
                    selectedCompletionInfo: { text: 'dir', range: new vscode.Range(1, 12, 1, 13) },
                }
            )

            expect(fn).not.toHaveBeenCalled()
            expect(items).toBe(null)
        })

        it('passes forward the last accepted completion item', async () => {
            const completionParams = params(
                dedent`
                    function foo() {
                        console.l█
                    }
                `,
                [completion`og();`]
            )

            const fn = vi.fn().mockResolvedValue(getInlineCompletions(completionParams))
            const provider = new MockableInlineCompletionItemProvider(fn)
            const completions = await provider.provideInlineCompletionItems(
                completionParams.document,
                completionParams.position,
                DUMMY_CONTEXT
            )

            await provider.handleDidAcceptCompletionItem(completions!.items[0]!)

            const secondCompletionsParams = params(
                dedent`
                    function foo() {
                        console.log();█
                    }
                `,
                [completion`og();`]
            )
            await provider.provideInlineCompletionItems(
                secondCompletionsParams.document,
                secondCompletionsParams.position,
                DUMMY_CONTEXT
            )

            expect(fn).toHaveBeenCalledWith(
                expect.objectContaining({
                    lastAcceptedCompletionItem: expect.objectContaining({
                        analyticsItem: expect.objectContaining({
                            insertText: 'og();',
                        }),
                    }),
                })
            )
        })
    })

    describe('error reporting', () => {
        beforeEach(() => {
            vi.useFakeTimers()
            vi.setSystemTime(new Date(2000, 1, 1, 13, 0, 0, 0))
        })

        afterEach(() => {
            vi.useRealTimers()
        })

        it('reports standard rate limit errors to the user once', async () => {
            const { document, position } = params('█', 'never-resolve')
            const fn = vi
                .fn(getInlineCompletions)
                .mockRejectedValue(
                    new RateLimitError('autocompletions', 'rate limited oh no', false, 1234, '86400')
                )
            const addError = vi.fn()
            const provider = new MockableInlineCompletionItemProvider(fn, {
                statusBar: { addError, hasError: () => addError.mock.calls.length } as any,
            })

            await expect(
                provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
            ).rejects.toThrow('rate limited oh no')
            expect(addError).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Cody Autocomplete Disabled Due to Rate Limit',
                    description:
                        "You've used all of your autocompletions for today. Usage will reset tomorrow at 1:00 PM",
                })
            )

            await expect(
                provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
            ).rejects.toThrow('rate limited oh no')
            expect(addError).toHaveBeenCalledTimes(1)
        })

        it.each([{ canUpgrade: true }, { canUpgrade: false }])(
            'reports correct message when canUpgrade=$canUpgrade',
            async ({ canUpgrade }) => {
                const { document, position } = params('█', 'never-resolve')
                const fn = vi
                    .fn(getInlineCompletions)
                    .mockRejectedValue(
                        new RateLimitError('autocompletions', 'rate limited oh no', canUpgrade, 1234)
                    )
                const addError = vi.fn()
                const provider = new MockableInlineCompletionItemProvider(fn, {
                    statusBar: { addError, hasError: () => addError.mock.calls.length } as any,
                })

                await expect(
                    provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
                ).rejects.toThrow('rate limited oh no')
                expect(addError).toHaveBeenCalledWith(
                    canUpgrade
                        ? expect.objectContaining({
                              title: 'Upgrade to Continue Using Cody Autocomplete',
                              description: "You've used all of your autocompletions for the month.",
                          })
                        : expect.objectContaining({
                              title: 'Cody Autocomplete Disabled Due to Rate Limit',
                              description: "You've used all of your autocompletions for today.",
                          })
                )

                await expect(
                    provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
                ).rejects.toThrow('rate limited oh no')
                expect(addError).toHaveBeenCalledTimes(1)
            }
        )

        it.skip('reports unexpected errors grouped by their message once', async () => {
            const { document, position } = params('█', 'never-resolve')
            let error = new Error('unexpected')
            const fn = vi.fn(getInlineCompletions).mockImplementation(() => Promise.reject(error))
            const addError = vi.fn()
            const provider = new MockableInlineCompletionItemProvider(fn, {
                statusBar: { addError, hasError: () => addError.mock.calls.length } as any,
            })

            await expect(
                provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
            ).rejects.toThrow('unexpected')
            expect(addError).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Cody Autocomplete Encountered an Unexpected Error',
                    description: 'unexpected',
                })
            )

            await expect(
                provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
            ).rejects.toThrow('unexpected')
            expect(addError).toHaveBeenCalledTimes(1)

            error = new Error('different')
            await expect(
                provider.provideInlineCompletionItems(document, position, DUMMY_CONTEXT)
            ).rejects.toThrow('different')
            expect(addError).toHaveBeenCalledWith(
                expect.objectContaining({
                    title: 'Cody Autocomplete Encountered an Unexpected Error',
                    description: 'different',
                })
            )
        })
    })
})
