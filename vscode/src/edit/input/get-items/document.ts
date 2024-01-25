import * as vscode from 'vscode'
import type { EditRangeSource } from '../../types'
import type { GetItemsResult } from '../quick-pick'
import { symbolIsFunctionLike, symbolIsVariableLike } from './utils'

export const DEFAULT_DOCUMENT_ITEMS: Record<
    Exclude<EditRangeSource, 'maximum'>,
    vscode.QuickPickItem
> = {
    selection: {
        label: '$(code) Selection',
        alwaysShow: true,
    },
    expanded: {
        label: '$(file-code) Expanded selection',
        description: 'Expand the selection to the nearest block of code',
        alwaysShow: true,
    },
}

/**
 * A mapping of document items to their relevant ranges.
 * This is needed so we can use the correct range to submit the edit when the user selects an item.
 */
export const DOCUMENT_ITEMS_RANGE_MAP = new Map<vscode.QuickPickItem, vscode.Range>()

export const getDocumentInputItems = async (
    document: vscode.TextDocument,
    activeRange: vscode.Range
): Promise<GetItemsResult> => {
    // Clear any cached document items
    DOCUMENT_ITEMS_RANGE_MAP.clear()

    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    )

    if (!symbols || symbols.length === 0) {
        return { items: Object.values(DEFAULT_DOCUMENT_ITEMS) }
    }

    const relevantSymbols = symbols.filter(sym => symbolIsFunctionLike(sym) || symbolIsVariableLike(sym))
    const wrappingSymbol = relevantSymbols.find(sym => sym.location.range.contains(activeRange.start))

    const items: vscode.QuickPickItem[] = []
    for (const symbol of relevantSymbols) {
        const item = { label: `$(symbol-method) ${symbol.name}` }
        DOCUMENT_ITEMS_RANGE_MAP.set(item, symbol.location.range)
        items.push(item)
    }
    const activeItem = wrappingSymbol
        ? items.find(({ label }) => label === `$(symbol-method) ${wrappingSymbol.name}`)
        : null

    return {
        items: [
            { label: 'symbols', kind: vscode.QuickPickItemKind.Separator },
            ...items,
            { label: 'other', kind: vscode.QuickPickItemKind.Separator },
            ...Object.values(DEFAULT_DOCUMENT_ITEMS),
        ],
        activeItems: activeItem ? [activeItem] : [DEFAULT_DOCUMENT_ITEMS.selection],
    }
}
