import type { ContextItem, ContextItemSymbol, SymbolKind } from '@sourcegraph/cody-shared'
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

const DUMMY_FILES: ContextItem[] = [
    { type: 'file', uri: URI.file('a.go') },
    ...Array.from(new Array(20).keys()).map(
        i =>
            ({
                uri: URI.file(`${i ? `${'dir/'.repeat(i + 1)}` : ''}file-a-${i}.py`),
                type: 'file',
            }) satisfies ContextItem
    ),
    { type: 'file', uri: URI.file('dir/file-large.py'), isTooLarge: true },
]

const DUMMY_SYMBOLS: ContextItemSymbol[] = Array.from(new Array(20).keys()).map(
    i =>
        ({
            symbolName: `Symbol${i}`,
            kind: ['function', 'class', 'method'][i % 3] as SymbolKind,
            uri: URI.file(`a/b/file${i}.go`),
            range: {
                start: {
                    line: i + 1,
                    character: (13 * i) % 80,
                },
                end: {
                    line: ((3 * i) % 100) + 1,
                    character: 1,
                },
            },
            type: 'symbol',
        }) satisfies ContextItemSymbol
)
