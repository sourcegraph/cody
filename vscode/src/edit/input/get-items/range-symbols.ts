import * as vscode from 'vscode'
// import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'
import type { GetItemsResult } from '../quick-pick'
import { symbolIsFunctionLike } from './utils'
import { getMinimumDistanceToRangeBoundary } from '../../../non-stop/utils'
import {
    QUICK_PICK_ITEM_CHECKED_PREFIX,
    QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
} from '../../../chat/context/constants'

export const RANGE_SYMBOLS_ITEM: vscode.QuickPickItem = {
    label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} $(symbol-method) Select a symbol...`,
    alwaysShow: true,
}

interface RangeInputInitialValues {
    initialCursorPosition: vscode.Position
    initialRange: vscode.Range
    initialExpandedRange?: vscode.Range
}

export const getRangeSymbolInputItems = async (
    initialValues: RangeInputInitialValues,
    symbolsPromise: Thenable<vscode.DocumentSymbol[]>
): Promise<GetItemsResult> => {
    const symbols = await symbolsPromise
    const symbolItems = symbols.map(symbol => {
        const icon = symbolIsFunctionLike(symbol) ? '$(symbol-method)' : '$(symbol-variable)'
        return {
            label: `${icon} ${symbol.name}`,
            range: symbol.range,
            selectionRange: symbol.selectionRange,
        }
    })

    const activeItem = symbolItems.sort(
        (a, b) =>
            getMinimumDistanceToRangeBoundary(initialValues.initialCursorPosition, a.range) -
            getMinimumDistanceToRangeBoundary(initialValues.initialCursorPosition, b.range)
    )[0]

    if (activeItem) {
        // Update the label of the active item
        activeItem.label = activeItem.label.replace(
            QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
            QUICK_PICK_ITEM_CHECKED_PREFIX
        )
    }

    return {
        items: [{ label: 'symbols', kind: vscode.QuickPickItemKind.Separator }, ...symbolItems],
        activeItem,
    }
}
