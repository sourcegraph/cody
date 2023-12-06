import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { completion } from '../test-helpers'

import { getInlineCompletions, params } from './helpers'

describe('[getInlineCompletions] hot streak', () => {
    it('caches hot streaks completions', async () => {
        const firstParams = params(
            dedent`
            function myFunction() {
                console.log(1)
                █
            }
        `,
            [
                completion`
                        ├console.log(2)
                        console.log(3)
                        console.log(4)
                        ┤
                    ┴┴┴┴
                `,
            ],
            {
                onNetworkRequest(_params, onPartialResponse) {
                    onPartialResponse?.(completion`
                            ├console.log(2)
                        ┤`)
                    onPartialResponse?.(completion`
                            ├console.log(2)
                            console.log(3)
                            console.┤
                        ┴┴┴┴`)
                    onPartialResponse?.(completion`
                            ├console.log(2)
                            console.log(3)
                            console.log(4)
                            ┤
                        ┴┴┴┴`)
                },
            }
        )
        const firstRequest = await getInlineCompletions(firstParams)

        expect(firstRequest?.items[0]?.insertText).toEqual('console.log(2)')

        const secondRequest = await getInlineCompletions({
            ...params(
                dedent`
                function myFunction() {
                    console.log(1)
                    console.log(2)
                    █
                }
            `,
                // No network request needed!
                []
            ),
            // Reuse the request manager to get a cache hit
            requestManager: firstParams.requestManager,
        })

        expect(secondRequest?.items[0]?.insertText).toEqual('console.log(3)')
        expect(secondRequest?.source).toEqual('Cache')

        const thirdRequest = await getInlineCompletions({
            ...params(
                dedent`
                function myFunction() {
                    console.log(1)
                    console.log(2)
                    console.log(3)
                    █
                }
            `,
                // No network request needed!
                []
            ),
            // Reuse the request manager to get a cache hit
            requestManager: firstParams.requestManager,
        })

        expect(thirdRequest?.items[0]?.insertText).toEqual('console.log(4)')
        expect(thirdRequest?.source).toEqual('Cache')
    })
})
