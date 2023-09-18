import { describe, expect, it } from 'vitest'

import { formatMatches, initTreeSitterParser } from '../test-helpers'

describe('lexical analysis', () => {
    describe('experiment', () => {
        it('finds error nodes', async () => {
            const parser = await initTreeSitterParser()

            const tree = parser.parse('console.log(1)\nfunction example(')
            const query = parser.getLanguage().query('(ERROR) @error')
            const matches = query.matches(tree.rootNode)
            const [{ captures }] = formatMatches(matches)

            expect(captures).toEqual([{ name: 'error', text: 'function example(' }])
        })
    })
})
