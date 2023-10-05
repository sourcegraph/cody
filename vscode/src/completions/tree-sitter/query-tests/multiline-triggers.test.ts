import { beforeAll, describe, it } from 'vitest'

import { initTreeSitterParser } from '../../test-helpers'
import { SupportedLanguage } from '../grammars'
import { getDocumentQuerySDK } from '../query-sdk'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('multilineTriggers', () => {
    beforeAll(async () => {
        await initTreeSitterParser(SupportedLanguage.TypeScript)
    })

    it('typescript', async () => {
        const { language, parser, queries } = getDocumentQuerySDK(SupportedLanguage.TypeScript)!

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.multilineTriggers.getEnclosingTrigger,
            sourcesPath: 'test-data/multiline-triggers.ts',
        })
    })
})
