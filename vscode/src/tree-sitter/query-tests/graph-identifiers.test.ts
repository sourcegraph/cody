import { describe, it } from 'vitest'

import { initTreeSitterSDK } from '../test-helpers'

import { SupportedLanguage } from '../grammars'
import { type Captures, annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getIntent', () => {
    const queryWrapper =
        (captures: Captures): Captures =>
        (node, start, end) => {
            const updatedStart = { row: Math.max(start.row - 100, 0), column: 0 }

            return captures(node, updatedStart, end)
        }

    it('javascriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.javascriptreact)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getGraphContextIdentifiers),
            sourcesPath: 'test-data/graph-identifiers.jsx',
        })
    })

    it('typescriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescriptreact)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getGraphContextIdentifiers),
            sourcesPath: 'test-data/graph-identifiers.tsx',
        })
    })

    it('go', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.go)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getGraphContextIdentifiers),
            sourcesPath: 'test-data/graph-identifiers.go',
        })
    })

    it('python', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.python)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getGraphContextIdentifiers),
            sourcesPath: 'test-data/graph-identifiers.py',
        })
    })
})
