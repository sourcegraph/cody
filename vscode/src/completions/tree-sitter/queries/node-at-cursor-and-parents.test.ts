import { beforeAll, describe, it } from 'vitest'

import { initTreeSitterParser } from '../../test-helpers'
import { SupportedLanguage } from '../grammars'
import { getDocumentQuerySDK } from '../queries'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getNodeAtCursorAndParents', () => {
    beforeAll(async () => {
        await initTreeSitterParser(SupportedLanguage.TypeScript)
    })

    it('typescript', async () => {
        const { language, parser, getNodeAtCursorAndParents } = getDocumentQuerySDK(SupportedLanguage.TypeScript)!

        await annotateAndMatchSnapshot({
            parser,
            language,
            rawQuery: 'Gets the "current" node at cursor position and tree parents.',
            captures: getNodeAtCursorAndParents,
            sourcesPath: 'test-data/parents.ts',
        })
    })
})
