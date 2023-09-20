import dedent from 'dedent'
import { describe, expect, it } from 'vitest'

import { completion } from '../test-helpers'

import { getInlineCompletionsInsertText, params } from './helpers'

describe('[getInlineCompletions] windows ', () => {
    it('works works with \\r\\n line terminators', async () => {
        const completion1 = completion`
                ├console.log('foo')
            }

            add() {
                console.log('bar')
            }┤
        ┴┴┴┴`
        const completion2 = completion`
                ├if (foo) {
                    console.log('foo1');
                }
            }

            add() {
                console.log('bar')
            }┤
        ┴┴┴┴`

        completion1.completion = windowsify(completion1.completion)
        completion2.completion = windowsify(completion2.completion)

        const items = await getInlineCompletionsInsertText(
            params(
                windowsify(dedent`
                    class Foo {
                        constructor() {
                            █
                        }
                    }
                `),
                [completion1, completion2]
            )
        )

        expect(items[0]).toBe("if (foo) {\n            console.log('foo1');\n        }")
        expect(items[1]).toBe("console.log('foo')")
    })
})

function windowsify(string: string): string {
    return string.replaceAll(/\n/g, '\r\n')
}
