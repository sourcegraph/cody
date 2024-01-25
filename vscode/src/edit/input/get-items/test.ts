import * as vscode from 'vscode'
import type { EditRangeSource } from '../../types'
import type { GetItemsResult } from '../quick-pick'
import { symbolIsFunctionLike } from './utils'

export const DEFAULT_TEST_ITEMS: Record<Exclude<EditRangeSource, 'maximum'>, vscode.QuickPickItem> = {
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
 * A mapping of test items to their relevant ranges.
 * This is needed so we can use the correct range to submit the edit when the user selects an item.
 */
export const TEST_ITEMS_RANGE_MAP = new Map<vscode.QuickPickItem, vscode.Range>()

export const getTestInputItems = async (
    document: vscode.TextDocument,
    activeRange: vscode.Range
): Promise<GetItemsResult> => {
    // Clear any cached test items
    TEST_ITEMS_RANGE_MAP.clear()

    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    )

    if (!symbols || symbols.length === 0) {
        return { items: Object.values(DEFAULT_TEST_ITEMS) }
    }

    const relevantSymbols = symbols.filter(symbolIsFunctionLike)
    // TODO: Improve so it actually finds the nearest, not the first containing
    const nearestSymbol = relevantSymbols.find(sym => sym.location.range.contains(activeRange.start))

    const items: vscode.QuickPickItem[] = []
    for (const symbol of relevantSymbols) {
        const item = { label: `$(symbol-method) ${symbol.name}` }
        TEST_ITEMS_RANGE_MAP.set(item, symbol.location.range)
        items.push(item)
    }
    const activeItem = nearestSymbol
        ? items.find(({ label }) => label === `$(symbol-method) ${nearestSymbol.name}`)
        : null

    return {
        items: [
            { label: 'symbols', kind: vscode.QuickPickItemKind.Separator },
            ...items,
            { label: 'other', kind: vscode.QuickPickItemKind.Separator },
            ...Object.values(DEFAULT_TEST_ITEMS),
        ],
        activeItems: activeItem ? [activeItem] : [DEFAULT_TEST_ITEMS.selection],
    }
}
