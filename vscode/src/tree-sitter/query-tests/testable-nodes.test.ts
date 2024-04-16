import { describe, it } from 'vitest'

import { initTreeSitterSDK } from '../test-helpers'

import type { QueryCapture } from 'web-tree-sitter'
import { SupportedLanguage } from '../grammars'
import type { QueryWrappers } from '../query-sdk'
import { type Captures, annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getTestableNode', () => {
    const queryWrapper =
        (query: QueryWrappers['getTestableNode']): Captures =>
        (node, start, end) => {
            const [testableNode] = query(node, start, end)
            if (!testableNode) {
                return []
            }
            const captures = [testableNode.symbol, testableNode.range].filter(
                (capture): capture is QueryCapture => capture !== undefined
            )

            return captures
        }

    it('typescript', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescript)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getTestableNode),
            sourcesPath: 'test-data/testable-node.ts',
        })
    })

    it('python', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.python)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getTestableNode),
            sourcesPath: 'test-data/testable-node.py',
        })
    })

    it('go', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.go)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getTestableNode),
            sourcesPath: 'test-data/testable-node.go',
        })
    })
})
