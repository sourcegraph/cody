import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { completion } from '../test-helpers'

import { getInlineCompletions, params } from './helpers'

describe('[getInlineCompletions] hot streak', () => {
    it('caches hot streaks completions', async () => {
        const firstRequest = await getInlineCompletions(
            params(
                dedent`
                function myFunction() {
                    console.log(1)
                    █
                }
            `,
                [
                    completion`
                    ├console.log(2)
                    console.log(3)┤
                `,
                ],
                {
                    onNetworkRequest(_params, onPartialResponse) {
                        onPartialResponse?.(completion`├console.log(2)\n┤`)
                        onPartialResponse?.(completion`├console.log(2)\nconsole.log(3)┤`)
                    },
                }
            )
        )

        expect(firstRequest?.items[0]?.insertText).toEqual('console.log(2)')

        const secondRequest = await getInlineCompletions(
            params(
                dedent`
                function myFunction() {
                    console.log(1)
                    console.log(2)
                    █
                }
            `,
                // No network request needed!
                []
            )
        )

        expect(secondRequest?.items[0]?.insertText).toEqual('console.log(3)')
        expect(secondRequest?.source).toEqual('console.log(3)')
    })
})
