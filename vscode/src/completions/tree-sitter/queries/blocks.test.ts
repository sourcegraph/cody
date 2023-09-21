import { beforeAll, describe, it } from 'vitest'

import { initTreeSitterParser } from '../../test-helpers'
import { SupportedLanguage } from '../grammars'
import { getDocumentQuerySDK } from '../queries'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('the blocks query', () => {
    beforeAll(async () => {
        await initTreeSitterParser(SupportedLanguage.TypeScript)
    })

    it('selects the first block-like statement at the cursor position', async () => {
        const { language, parser, queries, getFirstMultilineBlockForTruncation } = getDocumentQuerySDK(
            SupportedLanguage.TypeScript
        )!

        await annotateAndMatchSnapshot({
            parser,
            language,
            rawQuery: queries.blocks.raw,
            captures: getFirstMultilineBlockForTruncation,
            sourcesPath: 'test-data/blocks.ts',
        })
    })
})
