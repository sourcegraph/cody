import { describe, it } from 'vitest'

import { SupportedLanguage } from '../grammars'
import { getDocumentQuerySDK } from '../query-sdk'
import { initTreeSitterParser } from '../test-helpers'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('singlelineTriggers', () => {
    it('typescript', async () => {
        await initTreeSitterParser(SupportedLanguage.TypeScript)
        const { language, parser, queries } = getDocumentQuerySDK(SupportedLanguage.TypeScript)!

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getSinglelineTrigger,
            sourcesPath: 'test-data/singleline-triggers.ts',
        })
    })

    it('go', async () => {
        await initTreeSitterParser(SupportedLanguage.Go)
        const { language, parser, queries } = getDocumentQuerySDK(SupportedLanguage.Go)!

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getSinglelineTrigger,
            sourcesPath: 'test-data/singleline-triggers.go',
        })
    })
})
