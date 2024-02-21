import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { completion } from '../test-helpers'

import { getInlineCompletionsInsertText, params } from './helpers'

describe('[getInlineCompletions] windows ', () => {
    it('works works with \\r\\n line terminators', async () => {
        const completionResponse = completion`
                ├if (foo) {
                    console.log('foo1');
                }
            }

            add() {
                console.log('bar')
            }┤
        ┴┴┴┴`

        completionResponse.completion = windowsify(completionResponse.completion)

        const items = await getInlineCompletionsInsertText(
            params(
                windowsify(dedent`
                    class Foo {
                        constructor() {
                            █
                        }
                    }
                `),
                [completionResponse]
            )
        )

        expect(items[0]).toBe("if (foo) {\n            console.log('foo1');\n        }")
    })
})

function windowsify(string: string): string {
    return string.replaceAll('\n', '\r\n')
}
