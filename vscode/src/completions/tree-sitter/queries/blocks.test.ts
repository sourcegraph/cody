import { beforeAll, describe, it } from 'vitest'

import { initTreeSitterParser } from '../../test-helpers'
import { SupportedLanguage } from '../grammars'
import { getDocumentQuerySDK } from '../queries'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getFirstMultilineBlockForTruncation', () => {
    beforeAll(async () => {
        await initTreeSitterParser(SupportedLanguage.TypeScript)
    })

    it('typescript', async () => {
        const { language, parser, queries } = getDocumentQuerySDK(SupportedLanguage.TypeScript)!

        await annotateAndMatchSnapshot({
            parser,
            language,
            rawQuery: queries.blocks.raw,
            captures: queries.blocks.getFirstMultilineBlockForTruncation,
            sourcesPath: 'test-data/blocks.ts',
        })
    })
})
