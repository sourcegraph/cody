import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { resetParsersCache } from '../../tree-sitter/parser'
import { completion, initTreeSitterParser } from '../test-helpers'

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
                onNetworkRequest(_params, onPartialResponse) {
                    onPartialResponse?.(completion`
                        ├myFunction() {
                        console.log(1)
                    ┤`)
                    onPartialResponse?.(completion`
                        ├myFunction() {
                        console.log(1)
                        console.log(2)
                        console.log(3)
                        console.┤
                    ┴┴┴┴`)
                    onPartialResponse?.(completion`
                        ├myFunction() {
                        console.log(1)
                        console.log(2)
                        console.log(3)
                        console.log(4)
                    }
                    console.log(5)┤`)
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
                onNetworkRequest(_params, onPartialResponse) {
                    onPartialResponse?.(completion`├Test {
                            constructor() {
                                console.log(1)
                        ┤`)
                    onPartialResponse?.(completion`├Test {
                            constructor() {
                                console.log(1)
                                console.log(2)
                                console.log(3)
                                console.┤
                        `)
                    onPartialResponse?.(completion`├Test {
                            constructor() {
                                console.log(1)
                                console.log(2)
                                console.log(3)
                                console.log(4)
                            }
                        }
                        console.log(5)┤`)
                },
                dynamicMultilineCompletions: true,
            }
        )

        const completions = await getInlineCompletions(requestParams)
        expect(completions?.items[0]?.insertText).toMatchInlineSnapshot('"Test {"')
    })
})
