import dedent from 'dedent'
import { describe, expect, test } from 'vitest'

import { completion } from '../test-helpers'

import { getInlineCompletionsInsertText, params, T } from './helpers'

describe('[getInlineCompletions] multiline truncation', () => {
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
