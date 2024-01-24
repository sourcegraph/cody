import path from 'path'

import dedent from 'dedent'
import { describe, expect, it } from 'vitest'
import * as vscode from 'vscode'

import { isNode16 } from '../../isNode16'
import { getLanguageForFileName } from '../../language'

import { AutocompleteMatcher } from './AutocompleteMatcher'
import { EvaluationDocument } from './EvaluationDocument'
import { Queries } from './Queries'
import { isWindows } from './isWindows'

describe.skipIf(isWindows() || isNode16())('AutocompleteMatcher', () => {
    const queriesDirectory = path.join(__dirname, 'queries')
    const queries = new Queries(queriesDirectory)
    function checkInput(filename: string, text: string, assertion: (obtained: string) => void): void {
        it(filename, async () => {
            const matcher = new AutocompleteMatcher(
                {
                    filepath: filename,
                    fixture: 'test',
                    languageid: getLanguageForFileName(filename),
                    revision: 'HEAD',
                    strategy: 'bfg',
                    workspace: 'test',
                },
                queries,
                path.join(__dirname, '../../../../vscode/dist')
            )
            const matches = await matcher.matches(text)
            const result: string[] = []
            for (const match of matches || []) {
                const document = new EvaluationDocument(
                    matcher.params,
                    match.newText,
                    vscode.Uri.file(filename)
                )
                document.pushItem({
                    range: new vscode.Range(
                        match.requestPosition,
                        match.requestPosition.with(undefined, match.requestPosition.character + 1)
                    ),
                })
                result.push(document.formatSnapshot())
            }
            const resultString = result
                .join('\n')
                .split('\n')
                // Trim trailing whitespace because the formatter may remove it from the assertions
                // while it's normal for the transformation to preserve them.
                .map(line => line.trimEnd())
                .join('\n')

            // Insert leading newline to make sure the ^ caret is correctly
            // vertically aligned. Without this newline, the caret appears one
            // character too early because the inline snapshot start with an
            // opening double quote "
            assertion(`\n${resultString}`)
        })
    }

    checkInput(
        'if.ts',
        dedent`

        if (foo) {
            a.b
        } else {
            c.d
        }`,
        result =>
            expect(result).toMatchInlineSnapshot(`
              "
                if ()
              //    ^ AUTOCOMPLETE
              "
            `)
    )

    checkInput('variable-semicolon.ts', 'const a = {b: 42};', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            const a
          //       ^ AUTOCOMPLETE
          "
        `)
    )
    checkInput('variable-object.ts', 'const a = {b: 42}', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            const a
          //       ^ AUTOCOMPLETE
          "
        `)
    )
    checkInput('variable-array.ts', 'const a = [b.c, d.e]', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            const a
          //       ^ AUTOCOMPLETE
          "
        `)
    )
    checkInput('variable-empty.ts', 'const a = 42', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            const a
          //       ^ AUTOCOMPLETE
          "
        `)
    )
    checkInput('assignment-object.ts', 'a = {b: 42}', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            a
          // ^ AUTOCOMPLETE
          "
        `)
    )
    checkInput('assignment-array.ts', 'a = [b.c, d.e]}', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            a }
          // ^ AUTOCOMPLETE
          "
        `)
    )
    checkInput('assignment-empty.ts', 'a = 42', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            a
          // ^ AUTOCOMPLETE
          "
        `)
    )

    checkInput('call.ts', 'console.log("Hello world!")', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            console.log()
          //            ^ AUTOCOMPLETE
          "
        `)
    )

    checkInput('call-select.ts', 'log("Hello world!")', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            log()
          //    ^ AUTOCOMPLETE
          "
        `)
    )

    checkInput('call-new.ts', 'new Log("Hello world!")', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            new Log()
          //        ^ AUTOCOMPLETE
          "
        `)
    )

    checkInput('call-new-tparams.ts', 'new Log<T>("Hello world!")', result =>
        expect(result).toMatchInlineSnapshot(`
          "
            new Log<T>()
          //           ^ AUTOCOMPLETE
          "
        `)
    )

    checkInput(
        'function_declaration.ts',
        dedent`
        function sum(a: number, b: number): void {
            return a + 1
        }`,
        result =>
            expect(result).toMatchInlineSnapshot(`
          "
            function sum()
          //             ^ AUTOCOMPLETE
          "
        `)
    )

    checkInput(
        'method_definition.ts',
        dedent`
            class Summer {
              public sum(a: number, b: number): void {
                return a + 1
              }
            }`,
        result =>
            expect(result).toMatchInlineSnapshot(`
          "
            class Summer {
              public sum()
          //             ^ AUTOCOMPLETE
            }
          "
        `)
    )
    checkInput(
        'if.go',
        dedent`
            func main() {
                if err == nil {

                }
            }`,
        result =>
            expect(result).toMatchInlineSnapshot(`
              "
                func main()
              //          ^ AUTOCOMPLETE

                func main() {
                    if
              //       ^ AUTOCOMPLETE
                }
              "
            `)
    )
    checkInput(
        'struct-initializer.go',
        dedent`
            func main() {
                return &Kong{A: 42, B: "sdfs"}
            }`,
        result =>
            expect(result).toMatchInlineSnapshot(`
              "
                func main()
              //          ^ AUTOCOMPLETE

                func main() {
                    return &Kong{}
              //                 ^ AUTOCOMPLETE
                }
              "
            `)
    )
})
