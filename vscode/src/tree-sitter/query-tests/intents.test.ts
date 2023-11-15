import { describe, it } from 'vitest'

import { SupportedLanguage } from '../grammars'
import { initTreeSitterSDK } from '../test-helpers'

import { annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getIntent', () => {
    it('typescript', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.TypeScript)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents.ts',
        })
    })

    it('typescript incomplete code', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.TypeScript)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents-partial.ts',
        })
    })

    it('javascriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.JSX)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents.jsx',
        })
    })

    it('typescriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.TSX)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents.tsx',
        })
    })

    it('python', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.Python)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queries.getCompletionIntent,
            sourcesPath: 'test-data/intents.py',
        })
    })
})
