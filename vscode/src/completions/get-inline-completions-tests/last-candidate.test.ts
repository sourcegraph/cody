import dedent from 'dedent'
import { describe, expect, it, vitest } from 'vitest'
import * as vscode from 'vscode'

import { range } from '../../testutils/textDocument'
import { getCurrentDocContext } from '../get-current-doc-context'
import { InlineCompletionsResultSource, LastInlineCompletionCandidate } from '../get-inline-completions'
import { CompletionLogID } from '../logger'
import { documentAndPosition } from '../test-helpers'

import { getInlineCompletions, getInlineCompletionsInsertText, params, V } from './helpers'

describe('[getInlineCompletions] reuseLastCandidate', () => {
    function lastCandidate(
        code: string,
        insertText: string | string[],
        lastTriggerSelectedCompletionInfo?: {
            text: string
            range: vscode.Range
        },
        range?: vscode.Range
    ): LastInlineCompletionCandidate {
        const { document, position } = documentAndPosition(code)
        const lastDocContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 100,
            dynamicMultilineCompletions: false,
            context: lastTriggerSelectedCompletionInfo
                ? {
                      triggerKind: vscode.InlineCompletionTriggerKind.Automatic,
                      selectedCompletionInfo: lastTriggerSelectedCompletionInfo,
                  }
                : undefined,
        })
        return {
            uri: document.uri,
            lastTriggerPosition: position,
            lastTriggerSelectedCompletionInfo,
            result: {
                logId: '1' as CompletionLogID,
                source: InlineCompletionsResultSource.Network,
                items: Array.isArray(insertText)
                    ? insertText.map(insertText => ({ insertText }))
                    : [{ insertText, range }],
            },
            lastTriggerDocContext: lastDocContext,
        }
    }

    it('is reused when typing forward as suggested', async () =>
        // The user types `\n`, sees ghost text `const x = 123`, then types `const x = 1` (i.e.,
        // all but the last 2 characters of the ghost text). The original completion should
        // still display.
        expect(
            await getInlineCompletions(
                params('\nconst x = 1█', [], { lastCandidate: lastCandidate('\n█', 'const x = 123') })
            )
        ).toEqual<V>({
            items: [{ insertText: '23' }],
            source: InlineCompletionsResultSource.LastCandidate,
        }))

    it('updates the insertion range when typing forward as suggested', async () =>
        expect(
            await getInlineCompletions(
                params('\nconst x = 1█;', [], {
                    lastCandidate: lastCandidate('\nconst x = █;', '123', undefined, range(1, 10, 1, 10)),
                })
            )
        ).toEqual<V>({
            items: [{ insertText: '23', range: range(1, 11, 1, 11) }],
            source: InlineCompletionsResultSource.LastCandidate,
        }))

    it('is reused when typing forward as suggested through partial whitespace', async () =>
        // The user types ` `, sees ghost text ` x`, then types ` `. The original completion
        // should still display.
        expect(await getInlineCompletions(params('  █', [], { lastCandidate: lastCandidate(' █', ' x') }))).toEqual<V>({
            items: [{ insertText: 'x' }],
            source: InlineCompletionsResultSource.LastCandidate,
        }))

    it('is reused when typing forward as suggested through all whitespace', async () =>
        // The user sees ghost text `  x`, then types `  `. The original completion should still
        // display.
        expect(await getInlineCompletions(params('  █', [], { lastCandidate: lastCandidate('█', '  x') }))).toEqual<V>({
            items: [{ insertText: 'x' }],
            source: InlineCompletionsResultSource.LastCandidate,
        }))

    it('is reused when adding leading whitespace', async () =>
        // The user types ``, sees ghost text `x = 1`, then types ` ` (space). The original
        // completion should be reused.
        expect(await getInlineCompletions(params(' █', [], { lastCandidate: lastCandidate('█', 'x = 1') }))).toEqual<V>(
            {
                items: [{ insertText: 'x = 1' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }
        ))

    it('is reused when the deleting back to the start of the original trigger (but no further)', async () =>
        // The user types `const x`, accepts a completion to `const x = 123`, then deletes back
        // to `const x` (i.e., to the start of the original trigger). The original completion
        // should be reused.
        expect(
            await getInlineCompletions(params('const x█', [], { lastCandidate: lastCandidate('const x█', ' = 123') }))
        ).toEqual<V>({
            items: [{ insertText: ' = 123' }],
            source: InlineCompletionsResultSource.LastCandidate,
        }))

    it('is not reused when deleting past the entire original trigger', async () =>
        // The user types `const x`, accepts a completion to `const x = 1`, then deletes back to
        // `const ` (i.e., *past* the start of the original trigger). The original ghost text
        // should not be reused.
        expect(
            await getInlineCompletions(
                params('const █', [], {
                    lastCandidate: lastCandidate('const x█', ' = 1'),
                })
            )
        ).toEqual<V>({
            items: [],
            source: InlineCompletionsResultSource.Network,
        }))

    it('is not reused when the the next non-empty line has changed', async () => {
        // The user accepts a completion and then moves the cursor to the previous line and hits
        // enter again, causing a full suffix match with the previous completion that was
        // accepted before.
        const completions = await getInlineCompletions(
            params(
                dedent`
                    function foo() {
                        █
                        console.log()
                    }
                `,
                [],
                {
                    lastCandidate: lastCandidate(
                        dedent`
                        function foo() {
                            █
                        }
                    `,
                        'console.log()'
                    ),
                }
            )
        )

        expect(completions).toEqual<V>({
            items: [],
            source: InlineCompletionsResultSource.Network,
        })
    })

    it('is not reused when deleting the entire non-whitespace line', async () =>
        // The user types `const x`, then deletes the entire line. The original ghost text
        // should not be reused.
        expect(
            await getInlineCompletions(
                params('█', [], {
                    lastCandidate: lastCandidate('const x█', ' = 1'),
                })
            )
        ).toEqual<V>({
            items: [],
            source: InlineCompletionsResultSource.Network,
        }))

    it('is not reused when prefix changes', async () =>
        // The user types `x`, then deletes it, then types `y`. The original ghost text should
        // not be reused.
        expect(
            await getInlineCompletions(
                params('y█', [], {
                    lastCandidate: lastCandidate('x█', ' = 1'),
                })
            )
        ).toEqual<V>({
            items: [],
            source: InlineCompletionsResultSource.Network,
        }))

    it('is not reused and marked as accepted when the last character of a completion was typed', async () => {
        const handleDidAcceptCompletionItem = vitest.fn()
        // The user types the last character of a completion
        expect(
            await getInlineCompletions(
                params('const x = 1337█', [], {
                    lastCandidate: lastCandidate('const x = █', '1337'),
                    handleDidAcceptCompletionItem,
                })
            )
        ).toEqual<V>({
            items: [],
            source: InlineCompletionsResultSource.Network,
        })
        expect(handleDidAcceptCompletionItem).toHaveBeenCalled()
    })

    it('filters to only matching last-candidate items', async () =>
        // This behavior and test case is actually not needed for VS Code because it automatically
        // filters out items whose `insertText` does not prefix-match the replace range. (See
        // vscode.InlineCompletionItem.filterText for the docs about this.) But it is good to
        // perform this filtering anyway to avoid dependence on little-known VS Code behavior that
        // other consumers of this (via the agent) will likely not implement.
        expect(
            await getInlineCompletions(
                params('\nconsole.log("h█', [], {
                    lastCandidate: lastCandidate('\n█', ['console.log("Hi abc")', 'console.log("hi xyz")']),
                })
            )
        ).toEqual<V>({
            items: [{ insertText: 'i xyz")' }],
            source: InlineCompletionsResultSource.LastCandidate,
        }))

    describe('partial acceptance', () => {
        it('marks a completion as partially accepted when you type at least one word', async () => {
            const handleDidPartiallyAcceptCompletionItem = vitest.fn()

            const args = {
                lastCandidate: lastCandidate('█', 'console.log(1337)'),
                handleDidPartiallyAcceptCompletionItem,
            }

            // We did not complete the first word yet
            await getInlineCompletions(params('consol█', [], args))
            expect(handleDidPartiallyAcceptCompletionItem).not.toHaveBeenCalled()

            // Now we did
            await getInlineCompletions(params('console.█', [], args))
            expect(handleDidPartiallyAcceptCompletionItem).toHaveBeenCalledWith(expect.anything(), 8)

            // Subsequent keystrokes should continue updating the partial acceptance
            await getInlineCompletions(params('console.log(█', [], args))
            expect(handleDidPartiallyAcceptCompletionItem).toHaveBeenCalledWith(expect.anything(), 12)
        })
    })

    describe('deleting leading whitespace', () => {
        const candidate = lastCandidate('\t\t█', 'const x = 1')

        it('is reused when deleting some (not all) leading whitespace', async () =>
            // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then
            // deletes one `\t`. The same ghost text should still be displayed.
            expect(await getInlineCompletions(params('\t█', [], { lastCandidate: candidate }))).toEqual<V>({
                items: [{ insertText: '\tconst x = 1' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))

        it('is reused when deleting all leading whitespace', async () =>
            // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then deletes
            // all leading whitespace (both `\t\t`). The same ghost text should still be
            // displayed.
            expect(await getInlineCompletions(params('█', [], { lastCandidate: candidate }))).toEqual<V>({
                items: [{ insertText: '\t\tconst x = 1' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))

        it('is not reused when different leading whitespace is added at end of prefix', async () =>
            // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then deletes
            // `\t` and adds ` ` (space). The same ghost text should not still be displayed.
            expect(await getInlineCompletions(params('\t █', [], { lastCandidate: candidate }))).toEqual<V>({
                items: [],
                source: InlineCompletionsResultSource.Network,
            }))

        it('is not reused when different leading whitespace is added at start of prefix', async () =>
            // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then deletes
            // `\t\t` and adds ` \t` (space). The same ghost text should not still be displayed.
            expect(await getInlineCompletions(params(' \t█', [], { lastCandidate: candidate }))).toEqual<V>({
                items: [],
                source: InlineCompletionsResultSource.Network,
            }))

        it('is not reused when prefix replaced by different leading whitespace', async () =>
            // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then deletes
            // `\t\t` and adds ` ` (space). The same ghost text should not still be displayed.
            expect(await getInlineCompletions(params(' █', [], { lastCandidate: candidate }))).toEqual<V>({
                items: [],
                source: InlineCompletionsResultSource.Network,
            }))
    })

    it('is reused for a multi-line completion', async () =>
        // The user types ``, sees ghost text `x\ny`, then types ` ` (space). The original
        // completion should be reused.
        expect(await getInlineCompletions(params('x█', [], { lastCandidate: lastCandidate('█', 'x\ny') }))).toEqual<V>({
            items: [{ insertText: '\ny' }],
            source: InlineCompletionsResultSource.LastCandidate,
        }))

    it('is reused when adding leading whitespace for a multi-line completion', async () =>
        // The user types ``, sees ghost text `x\ny`, then types ` `. The original completion
        // should be reused.
        expect(await getInlineCompletions(params(' █', [], { lastCandidate: lastCandidate('█', 'x\ny') }))).toEqual<V>({
            items: [{ insertText: 'x\ny' }],
            source: InlineCompletionsResultSource.LastCandidate,
        }))

    describe('completeSuggestWidgetSelection', () => {
        it('is not reused when selected item info differs', async () =>
            // The user types `console`, sees the context menu pop up and receives a completion for
            // the first item. They now use the arrow keys to select the second item. The original
            // ghost text should not be reused as it won't be rendered anyways
            expect(
                await getInlineCompletions(
                    params('console.█', [], {
                        lastCandidate: lastCandidate('console.█', ' = 1', {
                            text: 'log',
                            range: range(0, 8, 0, 8),
                        }),
                        selectedCompletionInfo: {
                            text: 'dir',
                            range: range(0, 8, 0, 8),
                        },
                        completeSuggestWidgetSelection: true,
                        takeSuggestWidgetSelectionIntoAccount: true,
                    })
                )
            ).toEqual<V>({
                items: [],
                source: InlineCompletionsResultSource.Network,
            }))

        it('is reused when typing forward as suggested and the selected item info differs', async () =>
            // The user types `export c`, sees the context menu pop up `class` and receives a completion for
            // the first item. They now type fotward as suggested and reach the next word of the completion `Agent`.
            // The context menu pop up shows a different suggestion `Agent` but the original ghost text can be
            // reused because user continues to type as suggested.
            expect(
                await getInlineCompletions(
                    params('export class A█', [], {
                        lastCandidate: lastCandidate('export c█', 'lass Agent {', {
                            text: 'class',
                            range: range(0, 8, 0, 8),
                        }),
                        selectedCompletionInfo: {
                            text: 'Agent',
                            range: range(0, 8, 0, 8),
                        },
                        completeSuggestWidgetSelection: true,
                        takeSuggestWidgetSelectionIntoAccount: true,
                    })
                )
            ).toEqual<V>({
                items: [{ insertText: 'gent {' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))

        it('does not repeat injected suffix information when content is inserted', async () =>
            expect(
                await getInlineCompletionsInsertText(
                    params('console.l█', [], {
                        lastCandidate: lastCandidate('console.█', 'log("hello world")', {
                            text: 'log',
                            range: range(0, 8, 0, 8),
                        }),
                        selectedCompletionInfo: {
                            text: 'log',
                            range: range(0, 8, 0, 9),
                        },
                        completeSuggestWidgetSelection: true,
                    })
                )
            ).toEqual(['og("hello world")']))

        it('does not repeat injected suffix information when suggestion item is fully accepted', async () =>
            expect(
                await getInlineCompletionsInsertText(
                    params('console.log█', [], {
                        lastCandidate: lastCandidate('console.█', 'log("hello world")', {
                            text: 'log',
                            range: range(0, 8, 0, 8),
                        }),
                        selectedCompletionInfo: undefined,
                        completeSuggestWidgetSelection: true,
                    })
                )
            ).toEqual(['("hello world")']))
    })
})
