import { beforeAll, describe, it } from 'vitest'
import Parser from 'web-tree-sitter'

import { initTreeSitterParser } from '../../test-helpers'
import { SupportedLanguage } from '../grammars'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('the blocks query', () => {
    let parser: Parser

    beforeAll(async () => {
        parser = await initTreeSitterParser(SupportedLanguage.TypeScript)
    })

    it('selects the first block-like statement at the cursor position', async () => {
        await annotateAndMatchSnapshot({
            parser,
            language: SupportedLanguage.TypeScript,
            sourcesPath: 'test-data/blocks.ts',
            queryPath: './languages/javascript/blocks.scm',
        })
    })
})
