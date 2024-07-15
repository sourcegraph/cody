import {
    type ContextItem,
    FILE_CONTEXT_MENTION_PROVIDER,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    displayLineRange,
    displayPath,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import {
    QUICK_PICK_ITEM_CHECKED_PREFIX,
    QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
} from '../../chat/context/constants'

/**
 * Removes the string after the last '@' character in the given string.
 * Returns the original string if '@' is not found.
 */
export function removeAfterLastAt(str: string): string {
    const lastIndex = str.lastIndexOf('@')
    if (lastIndex === -1) {
        // Return the original string if "@" is not found
        return str
    }
    return str.slice(0, lastIndex)
}

/**
 * Returns a string representation of the given ContextItem for use in UI labels.
 * Includes the file path and an optional range or symbol specifier.
 */
export function getLabelForContextItem(item: ContextItem): string {
    switch (item.type) {
        case FILE_CONTEXT_MENTION_PROVIDER.id:
            if (item.title) {
                return `Add context from: ${item.title}`
            }

            {
                const rangeLabel = item.range ? `:${displayLineRange(item.range)}` : ''
                return `${displayPath(item.uri)}${rangeLabel}`
            }
        case SYMBOL_CONTEXT_MENTION_PROVIDER.id: {
            const rangeLabel = item.range ? `:${displayLineRange(item.range)}` : ''
            return `${displayPath(item.uri)}${rangeLabel}#${item.symbolName}`
        }
        default:
            throw new Error(`getLableForContextItem Error: Unexpected type ${item.type}`)
    }
}

/**
 * Returns the label for the given QuickPickItem, stripping any
 * prefixes used internally to track state.
 */
export function getItemLabel(item: vscode.QuickPickItem) {
    return item.label
        .replace(QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX, '')
        .replace(QUICK_PICK_ITEM_CHECKED_PREFIX, '')
        .trim()
}

export async function fetchDocumentSymbols(
    document: vscode.TextDocument
): Promise<vscode.DocumentSymbol[]> {
    const symbols = await vscode.commands.executeCommand<vscode.DocumentSymbol[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    )
    if (!symbols) {
        return []
    }

    const flattenSymbols = (symbol: vscode.DocumentSymbol): vscode.DocumentSymbol[] => {
        return [symbol, ...symbol.children.flatMap(flattenSymbols)]
    }

    // Sort all symbols by their start position in the document
    return symbols.flatMap(flattenSymbols).sort((a, b) => a.range.start.compareTo(b.range.start))
}
