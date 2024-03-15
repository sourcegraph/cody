import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resetParsersCache } from '../../tree-sitter/parser'
import { initTreeSitterParser } from '../test-helpers'

import { getInlineCompletionsWithInlinedChunks } from './helpers'

describe('[getInlineCompletions] dynamic multiline', () => {
    beforeAll(async () => {
        await initTreeSitterParser()
    })

    afterAll(() => {
        resetParsersCache()
    })

    it('continues generating a multiline completion if a multiline trigger is found on the first line', async () => {
        const { items } = await getInlineCompletionsWithInlinedChunks(
            `function █myFunction() {
                console.log(1)
                █console.log(2)
                console.log(3)
                console█.log(4)
            }
            console.log(5)█`,
            {
                delayBetweenChunks: 50,
            }
        )

        expect(items[0].insertText).toMatchInlineSnapshot(`
            "myFunction() {
                console.log(1)
                console.log(2)
                console.log(3)
                console.log(4)
            }"
        `)
    })

    it('switches to multiline completions for nested blocks', async () => {
        const { items } = await getInlineCompletionsWithInlinedChunks(
            `function myFunction(value) {
                if █(value) {
                    console.log('got it!')
                }

                return value█
            }`
        )

        expect(items[0].insertText).toMatchInlineSnapshot(`
          "(value) {
                  console.log('got it!')
              }"
        `)
    })

    it('switches to multiline completions for multiline function calls', async () => {
        const { items } = await getInlineCompletionsWithInlinedChunks(
            `const result = █myFunction(
                document,
                docContext█,
                isFinalRequest
            )

            const compeltion = new InlineCompletion(result)█
            console.log(completion)`
        )

        expect(items[0].insertText).toMatchInlineSnapshot(`
          "myFunction(
              document,
              docContext,
              isFinalRequest
          )"
        `)
    })

    it('switches to multiline completions for multiline arrays', async () => {
        const { items } = await getInlineCompletionsWithInlinedChunks(
            `const oddNumbers█ = [
                1,
                3,
                5,
                7,
                9,
            ]█

            console.log(oddNumbers)`
        )

        expect(items[0].insertText).toMatchInlineSnapshot(`
          " = [
              1,
              3,
              5,
              7,
              9,
          ]"
        `)
    })

    it('does not use dynamic multiline completions for certain languages', async () => {
        const { items } = await getInlineCompletionsWithInlinedChunks(
            `
- Autocomplete: Improved the new jaccard similarity retriever
- Edit: Added a multi-model selector. [pull/2951](█https://github.com/sourcegraph/cody/pull/2951)
- Edit: █Added Cody Pro support for models: █GPT-4. [█pull/2951](https://github.com/sourcegraph/cody/pull/2951)█
- Autocomplete: Remove obvious prompt-continuations. [pull/2974](https://github.com/sourcegraph/cody/pull/2974)`,
            {
                delayBetweenChunks: 50,
                languageId: 'markdown',
            }
        )

        expect(items[0].insertText).toMatchInlineSnapshot(
            `"https://github.com/sourcegraph/cody/pull/2951)"`
        )
    })
})
