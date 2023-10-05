import { describe, it } from 'vitest'

import { initTreeSitterParser } from '../../test-helpers'
import { SupportedLanguage } from '../grammars'
import { getDocumentQuerySDK } from '../query-sdk'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getFirstMultilineBlockForTruncation', () => {
    it('typescript', async () => {
        await initTreeSitterParser(SupportedLanguage.TypeScript)
        const { language, parser, queries } = getDocumentQuerySDK(SupportedLanguage.TypeScript)!

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.blocks.getFirstMultilineBlockForTruncation,
            sourcesPath: 'test-data/blocks.ts',
        })
    })
})
