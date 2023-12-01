import { describe, it } from 'vitest'

import { SupportedLanguage } from '../grammars'
import { initTreeSitterSDK } from '../test-helpers'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getDocumentableNode', () => {
    it('typescript', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.TypeScript)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getDocumentableNode,
            sourcesPath: 'test-data/documentable-node.ts',
        })
    })
})
