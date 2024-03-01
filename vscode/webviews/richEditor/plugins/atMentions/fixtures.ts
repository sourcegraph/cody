import type { ContextFile, ContextFileSymbol, SymbolKind } from '@sourcegraph/cody-shared'
import { URI } from 'vscode-uri'
import type { ChatContextClient } from './chatContextClient'

/**
 * For storybooks only.
 * @internal
 */
export const dummyChatContextClient: ChatContextClient = {
    async getChatContextItems(query) {
        await new Promise<void>(resolve => setTimeout(resolve, 250))

        query = query.toLowerCase()
        return query.startsWith('#')
            ? DUMMY_SYMBOLS.filter(
                  f =>
                      f.symbolName.toLowerCase().includes(query.slice(1)) ||
                      f.uri.path.includes(query.slice(1))
              )
            : DUMMY_FILES.filter(f => f.uri.path.includes(query))
    },
}

const DUMMY_FILES: ContextFile[] = [
    ...(Array.from(new Array(20).keys()).map(i => ({
        uri: URI.file(`${i ? `${'dir/'.repeat(i + 1)}` : ''}file-a-${i}.py`),
        type: 'file',
    })) satisfies ContextFile[]),
    { type: 'file', uri: URI.file('dir/file-large.py'), title: 'large-file' },
]

const DUMMY_SYMBOLS: ContextFileSymbol[] = Array.from(new Array(20).keys()).map(i => ({
    symbolName: `Symbol${i}`,
    kind: ['function', 'class', 'method'][i % 3] as SymbolKind,
    uri: URI.file(`a/b/file${i}.go`),
    type: 'symbol',
}))
