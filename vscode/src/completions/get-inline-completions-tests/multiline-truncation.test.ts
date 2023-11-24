import dedent from 'dedent'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { SupportedLanguage } from '../../tree-sitter/grammars'
import { resetParsersCache } from '../../tree-sitter/parser'
import { completion, initTreeSitterParser } from '../test-helpers'

import { getInlineCompletionsInsertText, params, T } from './helpers'

const cases = [true, false]

// Run truncation tests for both strategies: indentation-based and tree-sitter-based.
// We cannot use `describe.each` here because `toMatchInlineSnapshot` is not supported with it.
cases.forEach(isTreeSitterEnabled => {
    const label = isTreeSitterEnabled ? 'enabled' : 'disabled'

    describe(`[getInlineCompletions] multiline truncation with tree-sitter ${label}`, () => {
        describe('python', () => {
            beforeAll(async () => {
                if (isTreeSitterEnabled) {
                    await initTreeSitterParser(SupportedLanguage.Python)
                }
            })

            afterAll(() => {
                resetParsersCache()
            })

            it('truncates multiline completions based on tree-sitter query', async () => {
                expect(
                    (
                        await getInlineCompletionsInsertText(
                            params(
                                dedent`
                                    def foo():
                                        █
                                    `,
                                [
                                    completion`
                                    return "foo"
                            println("bar")
                                `,
                                ],
                                {
                                    languageId: 'python',
                                }
                            )
                        )
                    )[0]
                ).toBe(dedent`
                    return "foo"
                `)
            })

            it('truncates multiline completions and keeps full if statements', async () => {
                expect(
                    (
                        await getInlineCompletionsInsertText(
                            params(
                                dedent`
                                    if true:
                                        █
                                    `,
                                [
                                    completion`
                                    println(1)
                                elif false:
                                    println(2)
                                else:
                                    println(3)

                                println(4)
                                `,
                                ],
                                {
                                    languageId: 'python',
                                }
                            )
                        )
                    )[0]
                ).toMatchInlineSnapshot(`
                  "println(1)
                  elif false:
                      println(2)
                  else:
                      println(3)"
                `)
            })
        })

        describe('ts', () => {
            beforeAll(async () => {
                if (isTreeSitterEnabled) {
                    await initTreeSitterParser()
                }
            })

            afterAll(() => {
                resetParsersCache()
            })

            it('removes trailing spaces', async () => {
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

            it('honors a leading new line in the completion', async () => {
                const items = await getInlineCompletionsInsertText(
                    params(
                        dedent`
                    describe('bubbleSort', () => {
                        it('bubbleSort it case', () => {█

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

            it('cuts-off redundant closing brackets on the start indent level', async () => {
                const items = await getInlineCompletionsInsertText(
                    params(
                        dedent`
                    describe('bubbleSort', () => {
                        it('bubbleSort it case', () => {█

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

            it('cuts-off redundant closing brackets for completions from extended triggers', async () => {
                const items = await getInlineCompletionsInsertText(
                    params(
                        dedent`function bubbleSort(█) {

                    }`,
                        [
                            completion`
                        array: string[]): string[] {
                            let swapped
                            do {
                                swapped = false
                                for (let i = 0; i < array.length - 1; i++) {
                                    if (array[i] > array[i + 1]) {
                                        const temp = array[i]
                                        array[i] = array[i + 1]
                                        array[i + 1] = temp
                                        swapped = true
                                    }
                                }
                            } while (swapped)

                            return array
                        }`,
                        ]
                    )
                )

                expect(items[0]).toMatchInlineSnapshot(`
              "array: string[]): string[] {
                  let swapped
                  do {
                      swapped = false
                      for (let i = 0; i < array.length - 1; i++) {
                          if (array[i] > array[i + 1]) {
                              const temp = array[i]
                              array[i] = array[i + 1]
                              array[i + 1] = temp
                              swapped = true
                          }
                      }
                  } while (swapped)

                  return array"
            `)
            })

            it('cuts-off redundant closing brackets on the start indent level', async () => {
                const items = await getInlineCompletionsInsertText(
                    params(
                        dedent`
                    describe('bubbleSort', () => {
                        it('bubbleSort it case', () => {█

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

            it('keeps the closing bracket', async () => {
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

            it('uses an indentation based approach to cut-off completions', async () => {
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

            it('cuts-off the whole completions when suffix is very similar to suffix line', async () => {
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

            it('skips over empty lines', async () => {
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

            it('skips over else blocks', async () => {
                expect(
                    (
                        await getInlineCompletionsInsertText(
                            params(
                                dedent`
                    function whatever() {
                        console.log(123)
                    }
                    console.log(321); if (check) {
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

            it('includes closing parentheses in the completion', async () => {
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

            describe('stops when the next non-empty line of the suffix matches partially', () => {
                it('simple example', async () => {
                    expect(
                        (
                            await getInlineCompletionsInsertText(
                                params(
                                    dedent`
                        path: $GITHUB_WORKSPACE/vscode/.vscode-it/█
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

                it('example with return', async () => {
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

                it('example with inline comment', async () => {
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

            it('handles tab/newline interop in completion truncation', async () => {
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

            it('does not include block end character if there is already closed bracket', async () => {
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

            it('does not include block end character if there is already closed bracket [sort example]', async () => {
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

            it('normalizes Cody responses starting with an empty line and following the exact same indentation as the start line', async () => {
                expect(
                    (
                        await getInlineCompletionsInsertText(
                            params(
                                dedent`
                    function it() {
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

            if (isTreeSitterEnabled) {
                it('stops when the next non-empty line of the suffix matches', async () => {
                    expect(
                        await getInlineCompletionsInsertText(
                            params(
                                dedent`
                                function myFunction() {
                                    █
                                }
                        `,
                                [
                                    completion`
                                ├function nestedFunction() {
                                    console.log('one')
                                }

                                nestedFunction()
                                }┤`,
                                ]
                            )
                        )
                    ).toMatchInlineSnapshot(`
                  [
                    "function nestedFunction() {
                      console.log('one')
                  }

                  nestedFunction()",
                  ]
                `)
                })

                it('truncates multiline completions with inconsistent indentation', async () => {
                    expect(
                        (
                            await getInlineCompletionsInsertText(
                                params(
                                    dedent`
                        function it() {
                            █
                    `,
                                    [
                                        completion`
                            console.log('foo')
                        console.log('oops')
                        }

                        console.log('redundant')
                        `,
                                    ]
                                )
                            )
                        )[0]
                    ).toBe(dedent`
                    console.log('foo')
                console.log('oops')
                }
            `)
                })

                it('truncates multiline completions with many nested block statements', async () => {
                    expect(
                        (
                            await getInlineCompletionsInsertText(
                                params(
                                    dedent`
                        class Animal {
                            █
                        }
                    `,
                                    [
                                        completion`
                                        constructor(name: string) {}

                                        bark() {
                                            const barkData = { tone: 'loud' }
                                            this.produceSound(barkData)
                                        }

                                        wasuup() {
                                            this.bark()
                                        }
                                    }

                                    redundantFunctionCall(123)
                                    `,
                                    ]
                                )
                            )
                        )[0]
                    ).toMatchInlineSnapshot(`
                  "constructor(name: string) {}

                      bark() {
                          const barkData = { tone: 'loud' }
                          this.produceSound(barkData)
                      }

                      wasuup() {
                          this.bark()
                      }"
                `)
                })
            }
        })
    })
})
