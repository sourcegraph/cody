import { describe, expect, test } from 'vitest'

import { parseFileExplanations } from './rerank'

describe('parseFileExplanations', () => {
    test('parses filenames', async () => {
        expect(
            await parseFileExplanations(
                '<list><item><filename>filename 1</filename><explanation>this is why I chose this item</explanation></item><item><filename>filename 2</filename><explanation>why I chose this item</explanation></item></list>'
            )
        ).toEqual(['filename 1', 'filename 2'])
    })
})
