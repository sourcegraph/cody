import { describe, it } from 'vitest'

import { initTreeSitterSDK } from '../test-helpers'

import { SupportedLanguage } from '../grammars'
import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getIntent', () => {
    it('typescript', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescript)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents.ts',
        })
    })

    it('typescript incomplete code', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescript)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents-partial.ts',
        })
    })

    it('javascriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.javascriptreact)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents.jsx',
        })
    })

    it('typescriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescriptreact)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents.tsx',
        })
    })

    it('python', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.python)

        await annotateAndMatchSnapshot({
            parser,
            language,
            // TODO: fix the python query to work with the updated tree-sitter version
            captures: (node, start, end) =>
                queries.getCompletionIntent(node, start, { row: end!.row + 1, column: end!.column }),
            sourcesPath: 'test-data/intents.py',
        })
    })
})
