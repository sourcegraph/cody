import dedent from 'dedent'
import { describe, expect, test } from 'vitest'
import { URI } from 'vscode-uri'

import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { vsCodeMocks } from '../testutils/mocks'
import { range } from '../testutils/textDocument'

import {
    getInlineCompletions as _getInlineCompletions,
    InlineCompletionsParams,
    InlineCompletionsResultSource,
    LastInlineCompletionCandidate,
} from './getInlineCompletions'
import { createProviderConfig } from './providers/anthropic'
import { RequestManager } from './request-manager'
import { completion, documentAndPosition } from './testHelpers'

// The dedent package seems to replace `\t` with `\\t` so in order to insert a tab character, we
// have to use interpolation. We abbreviate this to `T` because ${T} is exactly 4 characters,
// mimicking the default indentation of four spaces
const T = '\t'

const URI_FIXTURE = URI.parse('file:///test.ts')

/**
 * A test helper to create the parameters for {@link getInlineCompletions}.
 *
 * The code example must include a block character (█) to denote the current cursor position.
 */
function params(
    code: string,
    responses: CompletionResponse[] | 'never-resolve',
    {
        languageId = 'typescript',
        requests = [],
        context = {
            triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
            selectedCompletionInfo: undefined,
        },
        ...params
    }: Partial<Omit<InlineCompletionsParams, 'document' | 'position'>> & {
        languageId?: string
        requests?: CompletionParameters[]
    } = {}
): InlineCompletionsParams {
    let requestCounter = 0
    const completionsClient: Pick<SourcegraphCompletionsClient, 'complete'> = {
        complete(params: CompletionParameters): Promise<CompletionResponse> {
            requests.push(params)
            return responses === 'never-resolve'
                ? new Promise(() => {})
                : Promise.resolve(responses?.[requestCounter++] || { completion: '', stopReason: 'unknown' })
        },
    }
    const providerConfig = createProviderConfig({
        completionsClient,
        contextWindowTokens: 2048,
    })

    const { document, position } = documentAndPosition(code, languageId, URI_FIXTURE.toString())

    return {
        document,
        position,
        context,
        promptChars: 1000,
        maxPrefixChars: 1000,
        maxSuffixChars: 1000,
        isEmbeddingsContextEnabled: true,
        providerConfig,
        responsePercentage: 0.4,
        prefixPercentage: 0.3,
        suffixPercentage: 0.3,
        toWorkspaceRelativePath: () => 'test.ts',
        requestManager: new RequestManager(),
        ...params,
    }
}

/**
 * Wraps the `getInlineCompletions` function to omit `logId` so that test expected values can omit
 * it and be stable.
 */
async function getInlineCompletions(
    ...args: Parameters<typeof _getInlineCompletions>
): Promise<Omit<NonNullable<Awaited<ReturnType<typeof _getInlineCompletions>>>, 'logId'> | null> {
    const result = await _getInlineCompletions(...args)
    if (result) {
        const { logId: _discard, ...rest } = result
        return rest
    }
    return result
}

/** Test helper for when you just want to assert the completion strings. */
async function getInlineCompletionsInsertText(...args: Parameters<typeof _getInlineCompletions>): Promise<string[]> {
    const result = await getInlineCompletions(...args)
    return result?.items.map(c => c.insertText) ?? []
}

type V = Awaited<ReturnType<typeof getInlineCompletions>>

describe('getInlineCompletions', () => {
    test('after whitespace', async () =>
        expect(await getInlineCompletions(params('foo = █', [completion`bar`]))).toEqual<V>({
            items: [{ insertText: 'bar' }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('end of word', async () =>
        expect(await getInlineCompletions(params('foo█', [completion`()`]))).toEqual<V>({
            items: [{ insertText: '()' }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('middle of line', async () =>
        expect(
            await getInlineCompletions(params('function bubbleSort(█)', [completion`array) {`, completion`items) {`]))
        ).toEqual<V>({
            items: [
                { insertText: 'array) {', range: range(0, 20, 0, 21) },
                { insertText: 'items) {', range: range(0, 20, 0, 21) },
            ],
            source: InlineCompletionsResultSource.Network,
        }))

    test('single-line mode only completes one line', async () =>
        expect(
            await getInlineCompletions(
                params(
                    `
        function test() {
            console.log(1);
            █
        }
        `,
                    [
                        completion`
                    ├if (true) {
                        console.log(3);
                    }
                    console.log(4);┤
                ┴┴┴┴`,
                    ]
                )
            )
        ).toEqual<V>({
            items: [{ insertText: 'if (true) {' }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('with selectedCompletionInfo', async () =>
        expect(
            await getInlineCompletions(
                params('array.so█', [completion`rt()`], {
                    context: {
                        triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
                        selectedCompletionInfo: { text: 'sort', range: new vsCodeMocks.Range(0, 6, 0, 8) },
                    },
                })
            )
        ).toEqual<V>({
            items: [{ insertText: 'rt()' }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('preserves leading whitespace when prefix has no trailing whitespace', async () =>
        expect(
            await getInlineCompletions(
                params('const isLocalHost = window.location.host█', [completion`├ === 'localhost'┤`])
            )
        ).toEqual<V>({
            items: [{ insertText: " === 'localhost'" }],
            source: InlineCompletionsResultSource.Network,
        }))

    test('collapses leading whitespace when prefix has trailing whitespace', async () =>
        expect(await getInlineCompletions(params('const x = █', [completion`├${T}7┤`]))).toEqual<V>({
            items: [{ insertText: '7' }],
            source: InlineCompletionsResultSource.Network,
        }))

    describe('same line suffix behavior', () => {
        test('does not trigger when there are alphanumeric chars in the line suffix', async () =>
            expect(await getInlineCompletions(params('foo = █ // x', []))).toBeNull())

        test('triggers when there are only non-alphanumeric chars in the line suffix', async () =>
            expect(await getInlineCompletions(params('foo = █;', []))).toBeTruthy())
    })

    describe('reuseResultFromLastCandidate', () => {
        function lastCandidate(code: string, insertText: string | string[]): LastInlineCompletionCandidate {
            const { document, position } = documentAndPosition(code)
            return {
                uri: document.uri,
                lastTriggerPosition: position,
                lastTriggerLinePrefix: document.lineAt(position).text.slice(0, position.character),
                result: {
                    logId: '1',
                    items: Array.isArray(insertText)
                        ? insertText.map(insertText => ({ insertText }))
                        : [{ insertText }],
                },
            }
        }

        test('reused when typing forward as suggested', async () =>
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

        test('reused when typing forward as suggested through partial whitespace', async () =>
            // The user types ` `, sees ghost text ` x`, then types ` `. The original completion
            // should still display.
            expect(
                await getInlineCompletions(params('  █', [], { lastCandidate: lastCandidate(' █', ' x') }))
            ).toEqual<V>({
                items: [{ insertText: 'x' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))

        test('reused when typing forward as suggested through all whitespace', async () =>
            // The user sees ghost text `  x`, then types `  `. The original completion should still
            // display.
            expect(
                await getInlineCompletions(params('  █', [], { lastCandidate: lastCandidate('█', '  x') }))
            ).toEqual<V>({
                items: [{ insertText: 'x' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))

        test('reused when adding leading whitespace', async () =>
            // The user types ``, sees ghost text `x = 1`, then types ` ` (space). The original
            // completion should be reused.
            expect(
                await getInlineCompletions(params(' █', [], { lastCandidate: lastCandidate('█', 'x = 1') }))
            ).toEqual<V>({
                items: [{ insertText: 'x = 1' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))

        test('reused when the deleting back to the start of the original trigger (but no further)', async () =>
            // The user types `const x`, accepts a completion to `const x = 123`, then deletes back
            // to `const x` (i.e., to the start of the original trigger). The original completion
            // should be reused.
            expect(
                await getInlineCompletions(
                    params('const x█', [], { lastCandidate: lastCandidate('const x█', ' = 123') })
                )
            ).toEqual<V>({
                items: [{ insertText: ' = 123' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))

        test('not reused when deleting past the entire original trigger', async () =>
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

        test('not reused when deleting the entire non-whitespace line', async () =>
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

        test('not reused when prefix changes', async () =>
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

        test('filtered to only matching last-candidate items', async () =>
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

        test('not reused when the previously visible item is no longer matching', async () =>
            // The user forward-types a character that matches a completion item that was not
            // visible before. The original ghost text should not be reused.
            expect(
                await getInlineCompletions(
                    params('\nconsol.log("h█', [], {
                        lastCandidate: lastCandidate('\n█', ['console.log("Hi")', 'console.log("hi")']),
                    })
                )
            ).toEqual<V>({
                items: [],
                source: InlineCompletionsResultSource.Network,
            }))

        describe('deleting leading whitespace', () => {
            const candidate = lastCandidate('\t\t█', 'const x = 1')

            test('reused when deleting some (not all) leading whitespace', async () =>
                // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then
                // deletes one `\t`. The same ghost text should still be displayed.
                expect(await getInlineCompletions(params('\t█', [], { lastCandidate: candidate }))).toEqual<V>({
                    items: [{ insertText: '\tconst x = 1' }],
                    source: InlineCompletionsResultSource.LastCandidate,
                }))

            test('reused when deleting all leading whitespace', async () =>
                // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then deletes
                // all leading whitespace (both `\t\t`). The same ghost text should still be
                // displayed.
                expect(await getInlineCompletions(params('█', [], { lastCandidate: candidate }))).toEqual<V>({
                    items: [{ insertText: '\t\tconst x = 1' }],
                    source: InlineCompletionsResultSource.LastCandidate,
                }))

            test('not reused when different leading whitespace is added at end of prefix', async () =>
                // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then deletes
                // `\t` and adds ` ` (space). The same ghost text should not still be displayed.
                expect(await getInlineCompletions(params('\t █', [], { lastCandidate: candidate }))).toEqual<V>({
                    items: [],
                    source: InlineCompletionsResultSource.Network,
                }))

            test('not reused when different leading whitespace is added at start of prefix', async () =>
                // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then deletes
                // `\t\t` and adds ` \t` (space). The same ghost text should not still be displayed.
                expect(await getInlineCompletions(params(' \t█', [], { lastCandidate: candidate }))).toEqual<V>({
                    items: [],
                    source: InlineCompletionsResultSource.Network,
                }))

            test('not reused when prefix replaced by different leading whitespace', async () =>
                // The user types on a new line `\t\t`, sees ghost text `const x = 1`, then deletes
                // `\t\t` and adds ` ` (space). The same ghost text should not still be displayed.
                expect(await getInlineCompletions(params(' █', [], { lastCandidate: candidate }))).toEqual<V>({
                    items: [],
                    source: InlineCompletionsResultSource.Network,
                }))
        })

        test('reused for a multi-line completion', async () =>
            // The user types ``, sees ghost text `x\ny`, then types ` ` (space). The original
            // completion should be reused.
            expect(
                await getInlineCompletions(params('x█', [], { lastCandidate: lastCandidate('█', 'x\ny') }))
            ).toEqual<V>({
                items: [{ insertText: '\ny' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))

        test('reused when adding leading whitespace for a multi-line completion', async () =>
            // The user types ``, sees ghost text `x\ny`, then types ` `. The original completion
            // should be reused.
            expect(
                await getInlineCompletions(params(' █', [], { lastCandidate: lastCandidate('█', 'x\ny') }))
            ).toEqual<V>({
                items: [{ insertText: 'x\ny' }],
                source: InlineCompletionsResultSource.LastCandidate,
            }))
    })

    describe('bad completion starts', () => {
        test.each([
            [completion`├➕     1┤`, '1'],
            [completion`├${'\u200B'}   1┤`, '1'],
            [completion`├.      1┤`, '1'],
            [completion`├+  1┤`, '1'],
            [completion`├-  1┤`, '1'],
        ])('fixes %s to %s', async (completion, expected) =>
            expect(await getInlineCompletions(params('█', [completion]))).toEqual<V>({
                items: [{ insertText: expected }],
                source: InlineCompletionsResultSource.Network,
            })
        )
    })

    describe('odd indentation', () => {
        test('filters out odd indentation in single-line completions', async () =>
            expect(await getInlineCompletions(params('const foo = █', [completion`├ 1┤`]))).toEqual<V>({
                items: [{ insertText: '1' }],
                source: InlineCompletionsResultSource.Network,
            }))
    })

    describe('multi-line completions', () => {
        test('removes trailing spaces', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                                function bubbleSort() {
                                    █
                                }`,
                            [
                                completion`
                                        ├console.log('foo')${' '}
                                        console.log('bar')${'    '}
                                        console.log('baz')${'  '}┤
                                    ┴┴┴┴`,
                            ]
                        )
                    )
                )[0]
            ).toMatchInlineSnapshot(`
                          "console.log('foo')
                              console.log('bar')
                              console.log('baz')"
                        `)
        })

        test('honors a leading new line in the completion', async () => {
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    describe('bubbleSort', () => {
                        it('bubbleSort test case', () => {█

                        })
                    })`,
                    [
                        completion`
                            ├${'  '}
                            const unsortedArray = [4,3,78,2,0,2]
                            const sortedArray = bubbleSort(unsortedArray)
                            expect(sortedArray).toEqual([0,2,2,3,4,78])
                        })
                    }┤`,
                    ]
                )
            )

            expect(items[0]).toMatchInlineSnapshot(`
              "
                      const unsortedArray = [4,3,78,2,0,2]
                      const sortedArray = bubbleSort(unsortedArray)
                      expect(sortedArray).toEqual([0,2,2,3,4,78])"
            `)
        })

        test('cuts-off redundant closing brackets on the start indent level', async () => {
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    describe('bubbleSort', () => {
                        it('bubbleSort test case', () => {█

                        })
                    })`,
                    [
                        completion`
                            ├const unsortedArray = [4,3,78,2,0,2]
                            const sortedArray = bubbleSort(unsortedArray)
                            expect(sortedArray).toEqual([0,2,2,3,4,78])
                        })
                    }┤`,
                    ]
                )
            )

            expect(items[0]).toMatchInlineSnapshot(`
              "const unsortedArray = [4,3,78,2,0,2]
                      const sortedArray = bubbleSort(unsortedArray)
                      expect(sortedArray).toEqual([0,2,2,3,4,78])"
            `)
        })

        test('keeps the closing bracket', async () => {
            const items = await getInlineCompletionsInsertText(
                params('function printHello(█)', [
                    completion`
                ├) {
                    console.log('Hello');
                }┤`,
                ])
            )

            expect(items[0]).toMatchInlineSnapshot(`
              ") {
                  console.log('Hello');
              }"
            `)
        })

        test('triggers a multi-line completion at the start of a block', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(params('function bubbleSort() {\n  █', [], { requests }))
            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
        })

        test('uses an indentation based approach to cut-off completions', async () => {
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    class Foo {
                        constructor() {
                            █
                        }
                    }
                `,
                    [
                        completion`
                            ├console.log('foo')
                        }

                        add() {
                            console.log('bar')
                        }┤
                    ┴┴┴┴`,
                        completion`
                            ├if (foo) {
                                console.log('foo1');
                            }
                        }

                        add() {
                            console.log('bar')
                        }┤
                    ┴┴┴┴`,
                    ]
                )
            )

            expect(items[0]).toBe("if (foo) {\n            console.log('foo1');\n        }")
            expect(items[1]).toBe("console.log('foo')")
        })

        test('cuts-off the whole completions when suffix is very similar to suffix line', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                    function() {
                        █
                        console.log('bar')
                    }
                `,
                            [
                                completion`
                        ├console.log('foo')
                        console.log('bar')
                    }┤`,
                            ]
                        )
                    )
                ).length
            ).toBe(0)
        })

        test('does not support multi-line completion on unsupported languages', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(params('function looksLegit() {\n  █', [], { languageId: 'elixir', requests }))
            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain('\n\n')
        })

        test('requires an indentation to start a block', async () => {
            const requests: CompletionParameters[] = []
            await getInlineCompletions(params('function bubbleSort() {\n█', [], { requests }))
            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain('\n\n')
        })

        test('works with python', async () => {
            const requests: CompletionParameters[] = []
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    for i in range(11):
                        if i % 2 == 0:
                            █
                `,
                    [
                        completion`
                            ├print(i)
                        elif i % 3 == 0:
                            print(f"Multiple of 3: {i}")
                        else:
                            print(f"ODD {i}")

                    for i in range(12):
                        print("unrelated")┤`,
                    ],
                    { languageId: 'python', requests }
                )
            )
            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(items[0]).toMatchInlineSnapshot(`
                "print(i)
                    elif i % 3 == 0:
                        print(f\\"Multiple of 3: {i}\\")
                    else:
                        print(f\\"ODD {i}\\")"
            `)
        })

        test('works with java', async () => {
            const requests: CompletionParameters[] = []
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0) {
                            █
                `,
                    [
                        completion`
                            ├System.out.println(i);
                        } else if (i % 3 == 0) {
                            System.out.println("Multiple of 3: " + i);
                        } else {
                            System.out.println("ODD " + i);
                        }
                    }

                    for (int i = 0; i < 12; i++) {
                        System.out.println("unrelated");
                    }┤`,
                    ],
                    { languageId: 'java', requests }
                )
            )
            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(items[0]).toMatchInlineSnapshot(`
                "System.out.println(i);
                    } else if (i % 3 == 0) {
                        System.out.println(\\"Multiple of 3: \\" + i);
                    } else {
                        System.out.println(\\"ODD \\" + i);
                    }"
            `)
        })

        // TODO: Detect `}\nelse\n{` pattern for else skip logic
        test('works with csharp', async () => {
            const requests: CompletionParameters[] = []
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0)
                        {
                            █
                `,
                    [
                        completion`
                            ├Console.WriteLine(i);
                        }
                        else if (i % 3 == 0)
                        {
                            Console.WriteLine("Multiple of 3: " + i);
                        }
                        else
                        {
                            Console.WriteLine("ODD " + i);
                        }

                    }

                    for (int i = 0; i < 12; i++)
                    {
                        Console.WriteLine("unrelated");
                    }┤`,
                    ],
                    { languageId: 'csharp', requests }
                )
            )
            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(items[0]).toMatchInlineSnapshot(`
                "Console.WriteLine(i);
                    }"
            `)
        })

        test('works with c++', async () => {
            const requests: CompletionParameters[] = []
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0) {
                            █
                `,
                    [
                        completion`
                            ├std::cout << i;
                        } else if (i % 3 == 0) {
                            std::cout << "Multiple of 3: " << i;
                        } else  {
                            std::cout << "ODD " << i;
                        }
                    }

                    for (int i = 0; i < 12; i++) {
                        std::cout << "unrelated";
                    }┤`,
                    ],
                    { languageId: 'cpp', requests }
                )
            )
            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(items[0]).toMatchInlineSnapshot(`
                "std::cout << i;
                    } else if (i % 3 == 0) {
                        std::cout << \\"Multiple of 3: \\" << i;
                    } else  {
                        std::cout << \\"ODD \\" << i;
                    }"
            `)
        })

        test('works with c', async () => {
            const requests: CompletionParameters[] = []
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0) {
                            █
                `,
                    [
                        completion`
                            ├printf("%d", i);
                        } else if (i % 3 == 0) {
                            printf("Multiple of 3: %d", i);
                        } else {
                            printf("ODD %d", i);
                        }
                    }

                    for (int i = 0; i < 12; i++) {
                        printf("unrelated");
                    }┤`,
                    ],
                    { languageId: 'c', requests }
                )
            )
            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(items[0]).toMatchInlineSnapshot(`
                "printf(\\"%d\\", i);
                    } else if (i % 3 == 0) {
                        printf(\\"Multiple of 3: %d\\", i);
                    } else {
                        printf(\\"ODD %d\\", i);
                    }"
            `)
        })

        test('works with php', async () => {
            const requests: CompletionParameters[] = []
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    for ($i = 0; $i < 11; $i++) {
                        if ($i % 2 == 0) {
                            █
                `,
                    [
                        completion`
                            ├echo $i;
                        } else if ($i % 3 == 0) {
                            echo "Multiple of 3: " . $i;
                        } else {
                            echo "ODD " . $i;
                        }
                    }

                    for ($i = 0; $i < 12; $i++) {
                        echo "unrelated";
                    }┤`,
                    ],
                    { languageId: 'c', requests }
                )
            )

            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(items[0]).toMatchInlineSnapshot(`
              "echo $i;
                  } else if ($i % 3 == 0) {
                      echo \\"Multiple of 3: \\" . $i;
                  } else {
                      echo \\"ODD \\" . $i;
                  }"
            `)
        })

        test('works with dart', async () => {
            const requests: CompletionParameters[] = []
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    for (int i = 0; i < 11; i++) {
                        if (i % 2 == 0) {
                            █
                `,
                    [
                        completion`
                            ├print(i);
                        } else if (i % 3 == 0) {
                          print('Multiple of 3: $i');
                        } else {
                          print('ODD $i');
                        }
                      }

                      for (int i = 0; i < 12; i++) {
                        print('unrelated');
                      }┤`,
                    ],
                    { languageId: 'dart', requests }
                )
            )

            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(items[0]).toMatchInlineSnapshot(`
              "print(i);
                  } else if (i % 3 == 0) {
                      print('Multiple of 3: $i');
                  } else {
                      print('ODD $i');
                  }"
            `)
        })

        test('skips over empty lines', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                    class Foo {
                        constructor() {
                            █
                        }
                    }
                `,
                            [
                                completion`
                            ├console.log('foo')

                            console.log('bar')

                            console.log('baz')┤
                    ┴┴┴┴┴┴┴┴`,
                            ]
                        )
                    )
                )[0]
            ).toMatchInlineSnapshot(`
              "console.log('foo')

                      console.log('bar')

                      console.log('baz')"
            `)
        })

        test('skips over else blocks', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                    if (check) {
                        █
                    }
                `,
                            [
                                completion`
                        ├console.log('one')
                    } else {
                        console.log('two')
                    }┤`,
                            ]
                        )
                    )
                )[0]
            ).toMatchInlineSnapshot(`
              "console.log('one')
              } else {
                  console.log('two')"
            `)
        })

        test('includes closing parentheses in the completion', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                if (check) {
                    █
                `,
                            [
                                completion`
                        ├console.log('one')
                    }┤`,
                            ]
                        )
                    )
                )[0]
            ).toMatchInlineSnapshot(`
              "console.log('one')
              }"
            `)
        })

        test('stops when the next non-empty line of the suffix matches', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                function myFunction() {
                    █
                    console.log('three')
                }
                `,
                            [
                                completion`
                        ├console.log('one')
                        console.log('two')
                        console.log('three')
                        console.log('four')
                    }┤`,
                            ]
                        )
                    )
                ).length
            ).toBe(0)
        })

        test('stops when the next non-empty line of the suffix matches exactly with one line completion', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                    function myFunction() {
                        console.log('one')
                        █
                        console.log('three')
                    }
                `,
                            [
                                completion`
                        ├console.log('three')
                    }┤`,
                            ]
                        )
                    )
                ).length
            ).toBe(0)
        })

        test('cuts off a matching line with the next line even if the completion is longer', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                    function bubbleSort() {
                        █
                        do {
                            swapped = false;
                            for (let i = 0; i < array.length - 1; i++) {
                                if (array[i] > array[i + 1]) {
                                    let temp = array[i];
                                    array[i] = array[i + 1];
                                    array[i + 1] = temp;
                                    swapped = true;
                                }
                            }
                        } while (swapped);
                    }`,
                            [
                                completion`
                        ├let swapped;
                        do {
                            swapped = false;
                            for (let i = 0; i < array.length - 1; i++) {
                                if (array[i] > array[i + 1]) {
                                    let temp = array[i];
                                    array[i] = array[i + 1];
                                    array[i + 1] = temp;
                                    swapped = true;
                                }
                            }
                        } while (swapped);┤
                    ┴┴┴┴`,
                            ]
                        )
                    )
                )[0]
            ).toBe('let swapped;')
        })

        describe('stops when the next non-empty line of the suffix matches partially', () => {
            test('simple example', async () => {
                expect(
                    (
                        await getInlineCompletionsInsertText(
                            params(
                                dedent`
                        path: $GITHUB_WORKSPACE/vscode/.vscode-test/█
                        key: {{ runner.os }}-pnpm-store-{{ hashFiles('**/pnpm-lock.yaml') }}`,
                                [
                                    completion`
                            ├pnpm-store
                            key: {{ runner.os }}-pnpm-{{ steps.pnpm-cache.outputs.STORE_PATH }}┤`,
                                ]
                            )
                        )
                    )[0]
                ).toBe('pnpm-store')
            })

            test('example with return', async () => {
                expect(
                    (
                        await getInlineCompletionsInsertText(
                            params(
                                dedent`
                        console.log('<< stop completion: █')
                        return []
                    `,
                                [
                                    completion`
                            lastChange was delete')
                            return []
                        `,
                                ]
                            )
                        )
                    )[0]
                ).toBe("lastChange was delete')")
            })

            test('example with inline comment', async () => {
                expect(
                    (
                        await getInlineCompletionsInsertText(
                            params(
                                dedent`
                        // █
                        const currentFilePath = path.normalize(document.fileName)
                    `,
                                [
                                    completion`
                            Get the file path
                            const filePath = normalize(document.fileName)
                        `,
                                ]
                            )
                        )
                    )[0]
                ).toBe('Get the file path')
            })
        })

        test('ranks results by number of lines', async () => {
            const items = await getInlineCompletionsInsertText(
                params(
                    dedent`
                    function test() {
                        █
                `,
                    [
                        completion`
                        ├console.log('foo')
                        console.log('foo')┤
                    ┴┴┴┴
                    `,
                        completion`
                        ├console.log('foo')
                        console.log('foo')
                        console.log('foo')
                        console.log('foo')
                        console.log('foo')┤
                    ┴┴┴┴`,
                        completion`
                        ├console.log('foo')┤
                    `,
                    ]
                )
            )

            expect(items[0]).toMatchInlineSnapshot(`
              "console.log('foo')
                  console.log('foo')
                  console.log('foo')
                  console.log('foo')
                  console.log('foo')"
            `)
            expect(items[1]).toMatchInlineSnapshot(`
              "console.log('foo')
                  console.log('foo')"
            `)
            expect(items[2]).toBe("console.log('foo')")
        })

        test('dedupes duplicate results', async () => {
            expect(
                await getInlineCompletionsInsertText(
                    params(
                        dedent`
                    function test() {
                        █
                `,
                        [completion`return true`, completion`return true`, completion`return true`]
                    )
                )
            ).toEqual(['return true'])
        })

        test('handles tab/newline interop in completion truncation', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                    class Foo {
                        constructor() {
                            █
                `,
                            [
                                completion`
                        ├console.log('foo')
                ${T}${T}if (yes) {
                ${T}${T}    sure()
                ${T}${T}}
                ${T}}

                ${T}add() {┤
                ┴┴┴┴`,
                            ]
                        )
                    )
                )[0]
            ).toMatchInlineSnapshot(`
                "console.log('foo')
                \t\tif (yes) {
                \t\t    sure()
                \t\t}
                \t}"
            `)
        })

        test('does not include block end character if there is already content in the block', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                    if (check) {
                        █
                        const d = 5;
                `,
                            [
                                completion`
                        ├console.log('one')
                    }┤`,
                            ]
                        )
                    )
                )[0]
            ).toBe("console.log('one')")
        })

        test('does not include block end character if there is already closed bracket', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            `
                if (check) {
                    █
                }`,
                            [completion`}`]
                        )
                    )
                ).length
            ).toBe(0)
        })

        test('does not include block end character if there is already closed bracket [sort example]', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            `
                 function bubbleSort(arr: number[]): number[] {
                   for (let i = 0; i < arr.length; i++) {
                     for (let j = 0; j < (arr.length - i - 1); j++) {
                       if (arr[j] > arr[j + 1]) {
                         // swap elements
                         let temp = arr[j];
                         arr[j] = arr[j + 1];
                         arr[j + 1] = temp;
                       }
                       █
                     }
                   }
                   return arr;
                 }`,
                            [completion`}`]
                        )
                    )
                ).length
            ).toBe(0)
        })

        test('normalizes Cody responses starting with an empty line and following the exact same indentation as the start line', async () => {
            expect(
                (
                    await getInlineCompletionsInsertText(
                        params(
                            dedent`
                    function test() {
                        █
                `,
                            [
                                completion`
                        ├
                        console.log('foo')┤
                    ┴┴┴┴`,
                            ]
                        )
                    )
                )[0]
            ).toBe("console.log('foo')")
        })
    })

    test('uses a more complex prompt for larger files', async () => {
        const requests: CompletionParameters[] = []
        await getInlineCompletions(
            params(
                dedent`
            class Range {
                public startLine: number
                public startCharacter: number
                public endLine: number
                public endCharacter: number
                public start: Position
                public end: Position

                constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
                    this.startLine = █
                    this.startCharacter = startCharacter
                    this.endLine = endLine
                    this.endCharacter = endCharacter
                    this.start = new Position(startLine, startCharacter)
                    this.end = new Position(endLine, endCharacter)
                }
            }
        `,
                [],
                { requests }
            )
        )
        expect(requests).toHaveLength(1)
        const messages = requests[0].messages
        expect(messages[messages.length - 1]).toMatchInlineSnapshot(`
            {
              "speaker": "assistant",
              "text": "Here is the code: <CODE5711>constructor(startLine: number, startCharacter: number, endLine: number, endCharacter: number) {
                    this.startLine =",
            }
        `)
        expect(requests[0].stopSequences).toEqual(['\n\nHuman:', '</CODE5711>', '\n\n'])
    })

    test('synthesizes a completion from a prior request', async () => {
        // Reuse the same request manager for both requests in this test
        const requestManager = new RequestManager()

        await getInlineCompletions(params('console.█', [completion`log('Hello, world!');`], { requestManager }))

        const completions = await getInlineCompletions(params('console.log(█', 'never-resolve', { requestManager }))

        expect(completions?.items[0].insertText).toBe("'Hello, world!');")
    })
})
