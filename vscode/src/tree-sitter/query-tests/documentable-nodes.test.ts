import { describe, it } from 'vitest'

import { initTreeSitterSDK } from '../test-helpers'

import type { QueryCapture } from 'web-tree-sitter'
import { SupportedLanguage } from '../grammars'
import type { QueryWrappers } from '../query-sdk'
import { type Captures, annotateAndMatchSnapshot } from './annotate-and-match-snapshot'

describe('getDocumentableNode', () => {
    const queryWrapper =
        (query: QueryWrappers['getDocumentableNode']): Captures =>
        (node, start, end) => {
            const [documentableNode] = query(node, start, end)
            if (!documentableNode) {
                return []
            }
            const captures = [
                documentableNode.symbol,
                documentableNode.range,
                documentableNode.insertionPoint,
            ].filter((capture): capture is QueryCapture => capture !== undefined)

            return captures
        }

    it('typescript', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescript)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.ts',
        })
    })

    it('typescriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.typescriptreact)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.tsx',
        })
    })

    it('javascriptreact', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.javascriptreact)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.jsx',
        })
    })

    it('python', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.python)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.py',
        })
    })

    it('go', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.go)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.go',
        })
    })

    it('java', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.java)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.java',
        })
    })

    it('kotlin', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.kotlin)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.kt',
        })
    })

    it('rust', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.rust)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.rs',
        })
    })

    it('php', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.php)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.php',
        })
    })

    it('c', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.c)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.c',
        })
    })

    it('cpp', async () => {
        const { language, parser, queries } = await initTreeSitterSDK(SupportedLanguage.cpp)

        await annotateAndMatchSnapshot({
            parser,
            language,
            captures: queryWrapper(queries.getDocumentableNode),
            sourcesPath: 'test-data/documentable-node.cpp',
        })
    })
})
