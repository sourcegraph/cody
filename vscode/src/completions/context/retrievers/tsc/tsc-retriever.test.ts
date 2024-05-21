import path from 'node:path'
import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import { Uri } from 'vscode'
import { vscodeWorkspaceTextDocuments } from '../../../../testutils/mocks'
import { getCurrentDocContext } from '../../../get-current-doc-context'
import { documentAndPosition } from '../../../test-helpers'
import { TscRetriever, defaultTscRetrieverOptions } from './tsc-retriever'

import { type AutocompleteContextSnippet, isWindows } from '@sourcegraph/cody-shared'

// TODO: fix Windows tests CODY-1280
describe.skipIf(isWindows())('TscRetriever', () => {
    const retriever = new TscRetriever({
        ...defaultTscRetrieverOptions(),
        includeSymbolsInCurrentFile: true,
        maxNodeMatches: 1,
        maxSymbolDepth: 1,
    })

    let testCounter = 0
    async function retrieve(
        text: string,
        params?: { skipNamespace: boolean }
    ): Promise<{ snippets: AutocompleteContextSnippet[]; moduleName: string; namespaceName: string }> {
        const counter = ++testCounter
        const moduleName = `example_${counter}`
        const namespaceName = `test_${counter}`
        const uri = Uri.file(path.join(process.cwd(), moduleName + '.ts'))
        // NOTE: wrap in namespace to avoid conflicts when reusing type names
        // between different tests. There's something buggy in how we load the
        // tsc service in this test suite so we get wrong results in we define
        // `interface A {}` in one file and `class A {}` in another.
        const wrappedText = params?.skipNamespace
            ? text
            : `export namespace ${namespaceName} {\n${text}\n}`
        const { document, position } = documentAndPosition(wrappedText, 'typescript', uri.toString())
        vscodeWorkspaceTextDocuments.push(document)

        const docContext = getCurrentDocContext({
            document,
            position,
            maxPrefixLength: 100,
            maxSuffixLength: 0,
        })
        const result = await retriever.retrieve({
            docContext,
            document,
            position,
            hints: { maxChars: 10_000, maxMs: 100 },
        })
        return { snippets: result, moduleName, namespaceName }
    }

    async function retrieveText(text: string): Promise<string[]> {
        return (await retrieve(text)).snippets.map(({ content }) => content)
    }

    it('imports', async () => {
        expect(
            await retrieveText(dedent`
            import { execFileSync } from 'child_process'
            const a = █
    `)
            // TODO: drill into Holder
        ).toMatchInlineSnapshot(`
          [
            "function execFileSync(file: string): Buffer",
            "function execFileSync(file: string, options: ExecFileSyncOptionsWithStringEncoding): string",
            "function execFileSync(file: string, options: ExecFileSyncOptionsWithBufferEncoding): Buffer",
            "function execFileSync(file: string, options?: ExecFileSyncOptions | undefined): string | Buffer",
            "function execFileSync(file: string, args: readonly string[]): Buffer",
            "function execFileSync(file: string, args: readonly string[], options: ExecFileSyncOptionsWithStringEncoding): string",
            "function execFileSync(file: string, args: readonly string[], options: ExecFileSyncOptionsWithBufferEncoding): Buffer",
            "function execFileSync(file: string, args?: readonly string[] | undefined, options?: ExecFileSyncOptions | undefined): string | Buffer",
            "const a: any",
          ]
        `)
    })

    it('imports2', async () => {
        const { moduleName } = await retrieve(
            dedent`
            export interface Holder { bananas: number }
            const holder = █
    `,
            { skipNamespace: true }
        )

        expect(
            await retrieveText(dedent`
            import { Holder } from './${moduleName}'
            const holder: Holder = █
    `)
            // TODO: drill into Holder
        ).toMatchInlineSnapshot(`
          [
            "const holder: Holder",
          ]
        `)
    })

    it('enum', async () => {
        expect(
            await retrieveText(dedent`
            enum Weekday { Monday, Wednesday, Saturbest }
            const day: Weekday = █
    `)
        ).toMatchInlineSnapshot(`
          [
            "enum Weekday {
            Monday
            Wednesday
            Saturbest
          }
          ",
            "const day: Weekday",
          ]
        `)
    })

    it('function-declaration', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: string[] }
            interface B { faster: boolean }
            function boom(a: A): B {
                return █
            }
    `)
            // TODO: assert `B` is also included
        ).toMatchInlineSnapshot(`
          [
            "interface A {
            value: string[]
          }
          ",
            "interface B {
            faster: boolean
          }
          ",
          ]
        `)
    })

    it('method-declaration', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: string[] }
            interface B { faster: boolean }
            class Main {
              boom(a: A): B {
                  return █
              }
            }
    `)
        ).toMatchInlineSnapshot(`
          [
            "interface A {
            value: string[]
          }
          ",
            "interface B {
            faster: boolean
          }
          ",
          ]
        `)
    })

    it('method-signature', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: string[] }
            interface B { faster: boolean }
            class Main {
              boom(a: A): B {
                  return █
              }
            }
    `)
        ).toMatchInlineSnapshot(`
          [
            "interface A {
            value: string[]
          }
          ",
            "interface B {
            faster: boolean
          }
          ",
          ]
        `)
    })

    it('function-expression', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: string[] }
            interface B { faster: boolean }
            const boom = (a: A): B => {
              return █
            }
    `)
        ).toMatchInlineSnapshot(`
          [
            "const boom: (a: A) => B",
            "interface A {
            value: string[]
          }
          ",
            "interface B {
            faster: boolean
          }
          ",
          ]
        `)
    })

    it('call-signature', async () => {
        expect(
            await retrieveText(dedent`
            interface Config2 { value: number }
            interface Config { maxResults: number, config2: Config2 }
            const handler: { (config: Config, length: number): string[]; value: string }
            function main(): string[] {
                return handler(█)
            }
    `)
            // TODO: assert `B` is also included
        ).toMatchInlineSnapshot(`
          [
            "const handler: {
              (config: Config, length: number): string[];
              value: string;
          }",
            "interface Config {
            maxResults: number
            config2: Config2
          }
          ",
            "(property) value: string",
          ]
        `)
    })

    it('member-selection', async () => {
        expect(
            await retrieveText(dedent`
            interface B { items: string[] }
            interface C { count: number }
            class A {
                private b: B = {items: ['a']}

                public run(c: C): void {
                  this.b.█
                }
            }
    `)
            // Observe that we don't include `C` because we prioritize `this.b`
        ).toMatchInlineSnapshot(`
          [
            "(property) A.b: B",
            "interface B {
            items: string[]
          }
          ",
            "(property) items: string[]",
          ]
        `)
    })

    it('member-selection2', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: number }
            interface B { a(): A }
            const b: B = {}
            function foo() {
              b.a().█
            }
    `)
        ).toMatchInlineSnapshot(`
          [
            "a(): A",
            "interface A {
            value: number
          }
          ",
          ]
        `)
    })

    it('call-expression', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: number }
            interface B { sum: number }
            function sum(a: A, b: A): B {
            }
            function main() {
                sum(█)
            }
    `)
        ).toMatchInlineSnapshot(`
          [
            "function sum(a: A, b: A): B",
            "interface A {
            value: number
          }
          ",
            "interface B {
            sum: number
          }
          ",
          ]
        `)
    })

    it('call-expression-2', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: number }
            interface B { sum: number }
            function sum_outer(a: A, b: A): B {
            }
            function sum_inner(a: number, b: string): B {
            }
            function main() {
                sum_outer(sum_inner(█))
            }
    `)
        ).toMatchInlineSnapshot(`
          [
            "function sum_inner(a: number, b: string): B",
            "interface B {
            sum: number
          }
          ",
          ]
        `)
    })

    it('object-literal', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: number }
            interface B { sum: A[] }
                const bs: B = {█}
    `)
        ).toMatchInlineSnapshot(`
          [
            "const bs: B",
            "interface B {
            sum: A[]
          }
          ",
          ]
        `)
    })

    it('object-literal-1', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: number }
            interface B { sum: A[] }
                const bs: B[] = [█]
    `)
        ).toMatchInlineSnapshot(`
          [
            "const bs: B[]",
            "interface B {
            sum: A[]
          }
          ",
          ]
        `)
    })

    it('object-literal-2', async () => {
        expect(
            await retrieveText(dedent`
            interface A { value: number }
            interface B { sum: A[] }
                const bs: B[] = [█]
    `)
        ).toMatchInlineSnapshot(`
          [
            "const bs: B[]",
            "interface B {
            sum: A[]
          }
          ",
          ]
        `)
    })
})
