import path from 'path'
import dedent from 'dedent'
import fspromises from 'fs/promises'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'
import { IndentationBasedFoldingRangeProvider } from '../../../vscode/src/lsp/foldingRanges'
import { AgentTextDocument } from '../AgentTextDocument'

// NOTE: this test case lives in the agent/ project so that we can mock out VS Code APIs.
describe('IndentationBasedFoldingRangeProvider', async () => {
    const provider = new IndentationBasedFoldingRangeProvider()
    function check(name: string, code: string, assertion: (obtained: string) => void): void {
        it(name, () => {
            const document = AgentTextDocument.from(vscode.Uri.parse('file:///test.ts'), code)
            const obtained = provider.provideFoldingRanges(
                document,
                {},
                new vscode.CancellationTokenSource().token
            )
            const formatted = formatFoldingRangesForSnapshotTesting(document, obtained)
            assertion(formatted)
        })
    }
    async function readFile(name: string): Promise<string> {
        return (
            await fspromises.readFile(path.join(__dirname, '..', '__tests__', 'example-ts', 'src', name))
        ).toString()
    }

    check(
        'typescript',
        dedent`
            class Foo {
                bar() {
                    function baz() {
                        // Oh no
                    }
                    return 1
                }
            }
            `,
        formatted =>
            expect(formatted).toMatchInlineSnapshot(`
          "class Foo {               // <- start 0
              bar() {                // <- start 1
                  function baz() {   // <- start 2
                      // Oh no
                  }                  // <- end 2
                  return 1
              }                      // <- end 1
          }
                                     // <- end 0
          "
        `)
    )

    check('typescript2', await readFile('TestClass.ts'), formatted =>
        expect(formatted).toMatchInlineSnapshot(`
          "const foo = 42

          export class TestClass {                               // <- start 0
              constructor(private shouldGreet: boolean) {}

              public functionName() {                            // <- start 1
                  if (this.shouldGreet) {                        // <- start 2
                      console.log(/* CURSOR */ 'Hello World!')
                  }                                              // <- end 2
              }                                                  // <- end 1
          }
                                                                 // <- end 0
          "
        `)
    )

    check('typescript3', await readFile('TestLogger.ts'), formatted =>
        expect(formatted).toMatchInlineSnapshot(`
          "const foo = 42
          export const TestLogger = {                                 // <- start 0
              startLogging: () => {                                   // <- start 1
                  // Do some stuff

                  function recordLog() {                              // <- start 2
                      console.log(/* CURSOR */ 'Recording the log')
                  }                                                   // <- end 2

                  recordLog()
              },                                                      // <- end 1
          }
                                                                      // <- end 0
          "
        `)
    )

    check('typescript4', await readFile('example.test.ts'), formatted =>
        expect(formatted).toMatchInlineSnapshot(`
          "import { expect } from 'vitest'
          import { it } from 'vitest'
          import { describe } from 'vitest'

          describe('test block', () => {                                                // <- start 0
              it('does 1', () => {                                                      // <- start 1
                  expect(true).toBe(true)
              })                                                                        // <- end 1

              it('does 2', () => {                                                      // <- start 2
                  expect(true).toBe(true)
              })                                                                        // <- end 2

              it('does something else', () => {                                         // <- start 3
                  // This line will error due to incorrect usage of \`performance.now\`
                  const startTime = performance.now(/* CURSOR */)
              })                                                                        // <- end 3
          })
                                                                                        // <- end 0
          "
        `)
    )

    check(
        'python',
        dedent`
          class Foo:
              a = 42
              def __init__(self):
                  print("Init")
                  pass
              def add(self, b):
                  print("a + b")
                  return self.a + b
            `,
        formatted =>
            expect(formatted).toMatchInlineSnapshot(`
              "class Foo:
                  a = 42
                  def __init__(self):     // <- start 0
                      print("Init")
                      pass
                  def add(self, b):       // <- end 0       // <- start 1
                      print("a + b")
                      return self.a + b
                                          // <- end 1
              "
            `)
    )
})

function formatFoldingRangesForSnapshotTesting(
    document: AgentTextDocument,
    ranges: vscode.FoldingRange[]
) {
    const result: string[] = []
    ranges.sort((a, b) => a.start - b.start)
    let widestLine = 0
    for (let lineNumber = 0; lineNumber < document.lineCount; lineNumber++) {
        const width = document.lineAt(lineNumber).text.length
        if (width > widestLine) {
            widestLine = width
        }
    }
    widestLine += 5
    for (let lineNumber = 0; lineNumber <= document.lineCount; lineNumber++) {
        const line = document.lineAt(lineNumber)
        result.push(line.text)
        const padSize = widestLine - line.text.length
        for (const [index, range] of ranges.entries()) {
            if (range.start === lineNumber) {
                // vitest indents the first line by one character in inline
                // snapshots to include the opening quote "
                const firstLineDiff = lineNumber === 0 ? 1 : 0
                result.push(
                    ` // <- start ${index}`.padStart(padSize + '// <- start'.length - firstLineDiff)
                )
            }
            if (range.end === lineNumber) {
                result.push(` // <- end ${index}`.padStart(padSize + '// <- end'.length))
            }
        }
        result.push('\n')
    }
    return result.join('')
}
