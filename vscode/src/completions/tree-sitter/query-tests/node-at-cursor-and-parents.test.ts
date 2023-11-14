import { beforeAll, describe, it } from 'vitest'

import { getNodeAtCursorAndParents } from '../../../tree-sitter/ast-getters'
import { SupportedLanguage } from '../../../tree-sitter/grammars'
import { getDocumentQuerySDK } from '../../../tree-sitter/query-sdk'
import { initTreeSitterParser } from '../../test-helpers'

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
            captures: getNodeAtCursorAndParents,
            sourcesPath: 'test-data/parents.ts',
        })
    })
})
