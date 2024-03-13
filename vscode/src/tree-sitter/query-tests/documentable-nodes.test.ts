import { describe, it } from 'vitest'

import { initTreeSitterSDK } from '../test-helpers'

import { SupportedLanguage } from '../grammars'
import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getDocumentableNode', () => {
    it('typescript', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescript)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getDocumentableNode,
            sourcesPath: 'test-data/documentable-node.ts',
        })
    })

    it('typescriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescriptreact)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getDocumentableNode,
            sourcesPath: 'test-data/documentable-node.tsx',
        })
    })

    it('javascriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.javascriptreact)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getDocumentableNode,
            sourcesPath: 'test-data/documentable-node.jsx',
        })
    })

    it('python', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.python)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getDocumentableNode,
            sourcesPath: 'test-data/documentable-node.py',
        })
    })

    it('go', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.go)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getDocumentableNode,
            sourcesPath: 'test-data/documentable-node.go',
        })
    })
})
