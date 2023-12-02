import { describe, expect, it } from 'vitest'

import { formatMatches, initTreeSitterParser } from './test-helpers'

describe('lexical analysis', () => {
    describe('experiment', () => {
        it('finds error nodes', async () => {
            const parser = await initTreeSitterParser()

            const tree = parser.parse('console.log(1)\nfunction example(')
            const query = parser.getLanguage().query('(ERROR) @error')
            const matches = query.matches(tree.rootNode)
            const [{ captures }] = formatMatches(matches)

            expect(captures).toMatchInlineSnapshot(`
              [
                {
                  "end": {
                    "column": 17,
                    "row": 1,
                  },
                  "name": "error",
                  "start": {
                    "column": 0,
                    "row": 1,
                  },
                  "text": "function example(",
                },
              ]
            `)
        })
    })
})
