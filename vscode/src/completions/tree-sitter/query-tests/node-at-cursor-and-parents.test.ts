import { beforeAll, describe, it } from 'vitest'

import { initTreeSitterParser } from '../../test-helpers'
import { astGetters } from '../ast-getters'
import { SupportedLanguage } from '../grammars'
import { getDocumentQuerySDK } from '../query-sdk'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getNodeAtCursorAndParents', () => {
    beforeAll(async () => {
        await initTreeSitterParser(SupportedLanguage.TypeScript)
    })

    it('typescript', async () => {
        const { language, parser } = getDocumentQuerySDK(SupportedLanguage.TypeScript)!

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: astGetters.getNodeAtCursorAndParents,
            sourcesPath: 'test-data/parents.ts',
        })
    })
})
