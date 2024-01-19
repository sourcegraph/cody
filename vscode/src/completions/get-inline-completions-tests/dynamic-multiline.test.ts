import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resetParsersCache } from '../../tree-sitter/parser'
import { completion, initTreeSitterParser, sleep } from '../test-helpers'

import { getInlineCompletions, params } from './helpers'

describe('[getInlineCompletions] dynamic multiline', () => {
    beforeAll(async () => {
        await initTreeSitterParser()
    })

    afterAll(() => {
        resetParsersCache()
    })

    it('continues generating a multiline completion if a multiline trigger is found on the first line', async () => {
        const requestParams = params(
            'function █',
            [
                completion`├myFunction() {
                        console.log(1)
                        console.log(2)
                        console.log(3)
                        console.log(4)
                    }
                    console.log(5)┤
                `,
            ],
            {
                async *completionResponseGenerator() {
                    yield completion`
                        ├myFunction() {
                        console.log(1)
                    ┤`

                    // Add paused between completion chunks to emulate
                    // the production behaviour where packets come with a delay.
                    await sleep(100)

                    yield completion`
                        ├myFunction() {
                        console.log(1)
                        console.log(2)
                        console.log(3)
                        console.┤
                    ┴┴┴┴`

                    await sleep(100)

                    yield completion`
                        ├myFunction() {
                        console.log(1)
                        console.log(2)
                        console.log(3)
                        console.log(4)
                    }
                    console.log(5)┤`
                },
                dynamicMultilineCompletions: true,
            }
        )

        const completions = await getInlineCompletions(requestParams)
        expect(completions?.items[0]?.insertText).toMatchInlineSnapshot(`
            "myFunction() {
                console.log(1)
                console.log(2)
                console.log(3)
                console.log(4)
            }"
        `)
    })

    it('does not use dynamic multiline for certain black listed cases', async () => {
        const requestParams = params(
            'class █',
            [
                completion`├Test {
                        constructor() {
                            console.log(1)
                            console.log(2)
                            console.log(3)
                            console.log(4)
                        }
                    }
                    console.log(5)┤
                `,
            ],
            {
                *completionResponseGenerator() {
                    yield completion`├Test {
                        constructor() {
                            console.log(1)
                    ┤`

                    yield completion`├Test {
                        constructor() {
                            console.log(1)
                            console.log(2)
                            console.log(3)
                            console.┤
                    `

                    yield completion`├Test {
                        constructor() {
                            console.log(1)
                            console.log(2)
                            console.log(3)
                            console.log(4)
                        }
                    }
                    console.log(5)┤`
                },
                dynamicMultilineCompletions: true,
            }
        )

        const completions = await getInlineCompletions(requestParams)
        expect(completions?.items[0]?.insertText).toMatchInlineSnapshot('"Test {"')
    })
})
