import path from 'path'

import { describe, expect, it } from 'vitest'

import { createParser, GenericLexem, SupportedLanguage } from './lexical-analysis'

const CUSTOM_WASM_LANGUAGE_DIR = path.resolve(__dirname, '..', '..', '..', 'resources', 'wasm')

describe('lexical analysis', () => {
    it('finds statement declaration correctly', async () => {
        const parser = createParser({
            language: SupportedLanguage.JavaScript,
            grammarDirectory: CUSTOM_WASM_LANGUAGE_DIR,
        })

        const tree = await parser.parse(`
                const d = 5;

                function helloWorld() {
                  if (d > 5) {
                    console.log('d is greater than 5')
                  } else {
                    // hello
                    console.log('hello from else statement')
                  }
                }

                console.log('hello d')
            `)

        expect(tree).toBeTruthy()

        const declaration = parser.findClosestLexem(tree!.rootNode, { row: 7, column: 25 }, GenericLexem.StatementBlock)

        expect(declaration?.text).toBe(`{
                    // hello
                    console.log('hello from else statement')
                  }`)
    })

    it('finds statement declaration within function correctly', async () => {
        const parser = createParser({
            language: SupportedLanguage.JavaScript,
            grammarDirectory: CUSTOM_WASM_LANGUAGE_DIR,
        })

        const tree = await parser.parse(`
                const var1 = 5;
                const var2 = 6;

                function greatComparator() {
                  if (d > 5) {
                    console.log('d is greater than 5')
                  } else {
                    // hello
                    console.log('hello from else statement')
                  }
                }

                console.log('end of program')
            `)

        expect(tree).toBeTruthy()

        const declaration = parser.findClosestLexem(tree!.rootNode, { row: 5, column: 25 }, GenericLexem.StatementBlock)

        expect(declaration?.text).toBe(`{
                  if (d > 5) {
                    console.log('d is greater than 5')
                  } else {
                    // hello
                    console.log('hello from else statement')
                  }
                }`)
    })
})
