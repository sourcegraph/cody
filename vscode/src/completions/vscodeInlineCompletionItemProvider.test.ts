import dedent from 'dedent'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type * as vscode from 'vscode'

import { CodebaseContext } from '@sourcegraph/cody-shared/src/codebase-context'
import { SourcegraphCompletionsClient } from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/client'
import {
    CompletionParameters,
    CompletionResponse,
} from '@sourcegraph/cody-shared/src/sourcegraph-api/completions/types'

import { CodyStatusBar } from '../services/StatusBar'
import { vsCodeMocks } from '../testutils/mocks'

import { CompletionsCache } from './cache'
import { DocumentHistory } from './history'
import { createProviderConfig } from './providers/anthropic'
import { completion, documentAndPosition } from './testHelpers'
import { InlineCompletionItemProvider } from './vscodeInlineCompletionItemProvider'

const CURSOR_MARKER = '█'

// The dedent package seems to replace `\t` with `\\t` so in order to insert a
// tab character, we have to use interpolation. We abbreviate this to `T`
// because ${T} is exactly 4 characters, mimicking the default indentation of
// four spaces
const T = '\t'

vi.mock('vscode', () => ({
    ...vsCodeMocks,
    workspace: {
        ...vsCodeMocks.workspace,
        asRelativePath(path: string) {
            return path
        },
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

vi.mock('./context-embeddings.ts', () => ({
    getContextFromEmbeddings: () => [],
}))

const NOOP_STATUS_BAR: CodyStatusBar = {
    dispose: () => {},
    startLoading: () => () => {},
}

const DUMMY_DOCUMENT_HISTORY: DocumentHistory = {
    addItem: () => {},
    lastN: () => [],
}

const DUMMY_CODEBASE_CONTEXT: CodebaseContext = new CodebaseContext(
    { serverEndpoint: 'https://example.com', useContext: 'none' },
    undefined,
    null,
    null,
    null
)

describe('Cody completions', () => {
    /**
     * A test helper to trigger a completion request. The code example must include
     * a pipe character to denote the current cursor position.
     *
     * @example
     *   complete(`
     * async function foo() {
     *   █
     * }`)
     */
    let complete: (
        code: string,
        responses?: CompletionResponse[] | 'stall',
        languageId?: string,
        context?: vscode.InlineCompletionContext
    ) => Promise<{
        requests: CompletionParameters[]
        completions: vscode.InlineCompletionItem[]
    }>
    beforeEach(() => {
        const cache = new CompletionsCache()
        complete = async (
            code: string,
            responses?: CompletionResponse[] | 'stall',
            languageId: string = 'typescript',
            context: vscode.InlineCompletionContext = {
                triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Automatic,
                selectedCompletionInfo: undefined,
            }
        ): Promise<{
            requests: CompletionParameters[]
            completions: vscode.InlineCompletionItem[]
        }> => {
            const requests: CompletionParameters[] = []
            let requestCounter = 0
            const completionsClient: Pick<SourcegraphCompletionsClient, 'complete'> = {
                complete(params: CompletionParameters): Promise<CompletionResponse> {
                    requests.push(params)
                    if (responses === 'stall') {
                        // Creates a stalling request that never responds
                        return new Promise(() => {})
                    }
                    return Promise.resolve(responses?.[requestCounter++] || { completion: '', stopReason: 'unknown' })
                },
            }
            const providerConfig = createProviderConfig({
                completionsClient,
                contextWindowTokens: 2048,
            })
            const completionProvider = new InlineCompletionItemProvider({
                providerConfig,
                statusBar: NOOP_STATUS_BAR,
                history: DUMMY_DOCUMENT_HISTORY,
                codebaseContext: DUMMY_CODEBASE_CONTEXT,
                disableTimeouts: true,
                cache,
            })

            if (!code.includes(CURSOR_MARKER)) {
                throw new Error(`The test code must include a ${CURSOR_MARKER} to denote the cursor position`)
            }

            const { document, position } = documentAndPosition(code, languageId)

            const completions = await completionProvider.provideInlineCompletionItems(document, position, context)

            return {
                requests,
                completions: 'items' in completions ? completions.items : completions,
            }
        }
    })

    it('uses a more complex prompt for larger files', async () => {
        const { requests } = await complete(dedent`
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
        `)

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

    it('makes a request when in the middle of a word', async () => {
        const { requests } = await complete('foo█', [completion`()`], undefined, undefined)
        expect(requests).toHaveLength(1)
    })

    it('completes a single-line at the end of a sentence', async () => {
        const { completions } = await complete('foo = █', [completion`'bar'`])

        expect(completions[0].insertText).toBe("'bar'")
    })

    it('only complete one line in single line mode', async () => {
        const { completions } = await complete(
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

        expect(completions[0].insertText).toBe('if (true) {')
    })

    it('completes a single-line at the middle of a sentence', async () => {
        const { completions } = await complete('function bubbleSort(█)', [completion`array) {`, completion`items) {`])

        expect(completions[0].insertText).toBe('array) {')
        expect(completions[1].insertText).toBe('items) {')
    })

    it('marks the rest of the line as to be replaced so closing characters in the same line suffix are properly merged', async () => {
        const { completions } = await complete('function bubbleSort(█)', [completion`array) {`])

        expect(completions[0].range).toMatchInlineSnapshot(`
          Range {
            "end": Position {
              "character": 21,
              "line": 0,
            },
            "start": Position {
              "character": 20,
              "line": 0,
            },
          }
        `)
    })

    it('does not make a request when context has a selectedCompletionInfo', async () => {
        const { requests } = await complete('foo = █', undefined, undefined, {
            selectedCompletionInfo: {
                range: new vsCodeMocks.Range(0, 0, 0, 3),
                text: 'something',
            },
            triggerKind: vsCodeMocks.InlineCompletionTriggerKind.Invoke,
        })

        expect(requests).toHaveLength(0)
    })

    it('preserves leading whitespace when prefix has no trailing whitespace', async () => {
        const { completions } = await complete('const isLocalHost = window.location.host█', [
            completion`├ === 'localhost'┤`,
        ])
        expect(completions[0].insertText).toBe(" === 'localhost'")
    })

    it('collapses leading whitespace when prefix has trailing whitespace', async () => {
        const { completions } = await complete('const x = █', [completion`├${T}7┤`])
        expect(completions[0].insertText).toBe('7')
    })

    it('should not trigger a request if there is text in the suffix for the same line', async () => {
        const { requests } = await complete('foo: █ = 123;')
        expect(requests).toHaveLength(0)
    })

    it('should trigger a request if the suffix of the same line is only special tags', async () => {
        const { requests } = await complete('if(█) {')
        expect(requests).toHaveLength(3)
    })

    describe('bad completion starts', () => {
        it.each([
            [completion`├➕     1┤`, '1'],
            [completion`├${'\u200B'}   1┤`, '1'],
            [completion`├.      1┤`, '1'],
            [completion`├+  1┤`, '1'],
            [completion`├-  1┤`, '1'],
        ])('fixes %s to %s', async (completion, expected) => {
            const { completions } = await complete(CURSOR_MARKER, [completion])
            expect(completions[0].insertText).toBe(expected)
        })
    })

    describe('odd indentation', () => {
        it('filters out odd indentation in single-line completions', async () => {
            const { completions } = await complete('const foo = █', [completion`├ 1┤`])
            expect(completions[0].insertText).toBe('1')
        })
    })

    describe('multi-line completions', () => {
        it('honors a leading new line in the completion', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toMatchInlineSnapshot(`
              "
                      const unsortedArray = [4,3,78,2,0,2]
                      const sortedArray = bubbleSort(unsortedArray)
                      expect(sortedArray).toEqual([0,2,2,3,4,78])"
            `)
        })

        it('cuts-off redundant closing brackets on the start indent level', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toMatchInlineSnapshot(`
              "const unsortedArray = [4,3,78,2,0,2]
                      const sortedArray = bubbleSort(unsortedArray)
                      expect(sortedArray).toEqual([0,2,2,3,4,78])"
            `)
        })

        it('keeps the closing bracket', async () => {
            const { completions } = await complete('function printHello(█)', [
                completion`
                ├) {
                    console.log('Hello');
                }┤`,
            ])

            expect(completions[0].insertText).toMatchInlineSnapshot(`
              ") {
                  console.log('Hello');
              }"
            `)
        })

        it('triggers a multi-line completion at the start of a block', async () => {
            const { requests } = await complete('function bubbleSort() {\n  █')

            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
        })

        it('uses an indentation based approach to cut-off completions', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toBe("if (foo) {\n            console.log('foo1');\n        }")
            expect(completions[1].insertText).toBe("console.log('foo')")
        })

        it('cuts-off the whole completions when suffix is very similar to suffix line', async () => {
            const { completions } = await complete(
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

            expect(completions.length).toBe(0)
        })

        it('does not support multi-line completion on unsupported languages', async () => {
            const { requests } = await complete('function looksLegit() {\n  █', undefined, 'elixir')

            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain('\n\n')
        })

        it('requires an indentation to start a block', async () => {
            const { requests } = await complete('function bubbleSort() {\n█')

            expect(requests).toHaveLength(1)
            expect(requests[0].stopSequences).toContain('\n\n')
        })

        it('works with python', async () => {
            const { completions, requests } = await complete(
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
                'python'
            )

            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(completions[0].insertText).toMatchInlineSnapshot(`
                "print(i)
                    elif i % 3 == 0:
                        print(f\\"Multiple of 3: {i}\\")
                    else:
                        print(f\\"ODD {i}\\")"
            `)
        })

        it('works with java', async () => {
            const { completions, requests } = await complete(
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
                'java'
            )

            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(completions[0].insertText).toMatchInlineSnapshot(`
                "System.out.println(i);
                    } else if (i % 3 == 0) {
                        System.out.println(\\"Multiple of 3: \\" + i);
                    } else {
                        System.out.println(\\"ODD \\" + i);
                    }"
            `)
        })

        // TODO: Detect `}\nelse\n{` pattern for else skip logic
        it('works with csharp', async () => {
            const { completions, requests } = await complete(
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
                'csharp'
            )

            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(completions[0].insertText).toMatchInlineSnapshot(`
                "Console.WriteLine(i);
                    }"
            `)
        })

        it('works with c++', async () => {
            const { completions, requests } = await complete(
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
                'cpp'
            )

            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(completions[0].insertText).toMatchInlineSnapshot(`
                "std::cout << i;
                    } else if (i % 3 == 0) {
                        std::cout << \\"Multiple of 3: \\" << i;
                    } else  {
                        std::cout << \\"ODD \\" << i;
                    }"
            `)
        })

        it('works with c', async () => {
            const { completions, requests } = await complete(
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
                'c'
            )

            expect(requests).toHaveLength(3)
            expect(requests[0].stopSequences).not.toContain('\n')
            expect(completions[0].insertText).toMatchInlineSnapshot(`
                "printf(\\"%d\\", i);
                    } else if (i % 3 == 0) {
                        printf(\\"Multiple of 3: %d\\", i);
                    } else {
                        printf(\\"ODD %d\\", i);
                    }"
            `)
        })

        it('skips over empty lines', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toMatchInlineSnapshot(`
              "console.log('foo')

                      console.log('bar')

                      console.log('baz')"
            `)
        })

        it('skips over else blocks', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toMatchInlineSnapshot(`
              "console.log('one')
              } else {
                  console.log('two')"
            `)
        })

        it('includes closing parentheses in the completion', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toMatchInlineSnapshot(`
              "console.log('one')
              }"
            `)
        })

        it('stops when the next non-empty line of the suffix matches', async () => {
            const { completions } = await complete(
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

            expect(completions.length).toBe(0)
        })

        it('stops when the next non-empty line of the suffix matches exactly with one line completion', async () => {
            const { completions } = await complete(
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

            expect(completions.length).toBe(0)
        })

        it('cuts off a matching line with the next line even if the completion is longer', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toBe('let swapped;')
        })

        describe('stops when the next non-empty line of the suffix matches partially', () => {
            it('simple example', async () => {
                const { completions } = await complete(
                    dedent`
                        path: $GITHUB_WORKSPACE/vscode/.vscode-test/█
                        key: {{ runner.os }}-pnpm-store-{{ hashFiles('**/pnpm-lock.yaml') }}`,
                    [
                        completion`
                            ├pnpm-store
                            key: {{ runner.os }}-pnpm-{{ steps.pnpm-cache.outputs.STORE_PATH }}┤`,
                    ]
                )

                expect(completions[0].insertText).toBe('pnpm-store')
            })

            it('example with return', async () => {
                const { completions } = await complete(
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

                expect(completions[0].insertText).toBe("lastChange was delete')")
            })

            it('example with inline comment', async () => {
                const { completions } = await complete(
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

                expect(completions[0].insertText).toBe('Get the file path')
            })
        })

        it('ranks results by number of lines', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toMatchInlineSnapshot(`
              "console.log('foo')
                  console.log('foo')
                  console.log('foo')
                  console.log('foo')
                  console.log('foo')"
            `)
            expect(completions[1].insertText).toMatchInlineSnapshot(`
              "console.log('foo')
                  console.log('foo')"
            `)
            expect(completions[2].insertText).toBe("console.log('foo')")
        })

        it('dedupes duplicate results', async () => {
            const { completions } = await complete(
                dedent`
                    function test() {
                        █
                `,
                [completion`return true`, completion`return true`, completion`return true`]
            )

            expect(completions.length).toBe(1)
            expect(completions[0].insertText).toBe('return true')
        })

        it('handles tab/newline interop in completion truncation', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toMatchInlineSnapshot(`
                "console.log('foo')
                \t\tif (yes) {
                \t\t    sure()
                \t\t}
                \t}"
            `)
        })

        it('does not include block end character if there is already content in the block', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toBe("console.log('one')")
        })

        it('does not include block end character if there is already closed bracket', async () => {
            const { completions } = await complete(
                `
                if (check) {
                    ${CURSOR_MARKER}
                }`,
                [completion`}`]
            )

            expect(completions.length).toBe(0)
        })

        it('does not include block end character if there is already closed bracket [sort example]', async () => {
            const { completions } = await complete(
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
                       ${CURSOR_MARKER}
                     }
                   }
                   return arr;
                 }`,
                [completion`}`]
            )

            expect(completions.length).toBe(0)
        })

        it('normalizes Cody responses starting with an empty line and following the exact same indentation as the start line', async () => {
            const { completions } = await complete(
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

            expect(completions[0].insertText).toBe("console.log('foo')")
        })
    })

    describe('completions cache', () => {
        it('synthesizes a completion from a prior request', async () => {
            await complete('console.█', [completion`log('Hello, world!');`])

            const { completions } = await complete('console.log(█', 'stall')

            expect(completions[0].insertText).toBe("'Hello, world!');")
        })
    })
})
