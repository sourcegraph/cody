import * as vscode from 'vscode'
import { isGenerateIntent } from '../../utils/edit-intent'
import { getEditSmartSelection } from '../../utils/edit-selection'
import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'
import type { EditInputInitialValues } from '../get-input'
import type { GetItemsResult } from '../quick-pick'
import { CURSOR_RANGE_ITEM, EXPANDED_RANGE_ITEM, SELECTION_RANGE_ITEM } from './constants'
import type { EditRangeItem } from './types'
import { symbolIsFunctionLike } from './utils'

const getDefaultRangeItems = (
    document: vscode.TextDocument,
    initialValues: RangeInputInitialValues
): EditRangeItem[] => {
    const { initialRange, initialExpandedRange, initialCursorPosition } = initialValues

    const cursorItem = {
        ...CURSOR_RANGE_ITEM,
        range: new vscode.Range(initialCursorPosition, initialCursorPosition),
    }

    if (initialExpandedRange) {
        // No need to show the selection (it will be the same as the expanded range)
        return [
            cursorItem,
            {
                ...EXPANDED_RANGE_ITEM,
                range: initialExpandedRange,
            },
        ]
    }

    if (isGenerateIntent(document, initialRange)) {
        // No need to show the selection (it will be the same as the cursor position)
        return [
            cursorItem,
            {
                ...EXPANDED_RANGE_ITEM,
                range: async () =>
                    getEditSmartSelection(document, initialRange, {
                        forceExpand: true,
                    }),
            },
        ]
    }

    return [
        cursorItem,
        {
            ...SELECTION_RANGE_ITEM,
            range: initialRange,
        },
        {
            ...EXPANDED_RANGE_ITEM,
            range: async () =>
                getEditSmartSelection(document, initialRange, {
                    forceExpand: true,
                }),
        },
    ]
}

interface RangeInputInitialValues extends EditInputInitialValues {
    initialCursorPosition: vscode.Position
}

export const getRangeInputItems = async (
    document: vscode.TextDocument,
    initialValues: RangeInputInitialValues,
    activeRange: vscode.Range,
    symbolsPromise: Thenable<vscode.DocumentSymbol[]>
): Promise<GetItemsResult> => {
    const defaultItems = getDefaultRangeItems(document, initialValues).map(item => ({
        ...item,
        label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${item.label}`,
    }))
    const symbols = await symbolsPromise
    const symbolItems: EditRangeItem[] = symbols.filter(symbolIsFunctionLike).map(symbol => ({
        label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} $(symbol-method) ${symbol.name}`,
        range: symbol.range,
    }))

    const activeItem = [...defaultItems, ...symbolItems].find(
        item => item.range instanceof vscode.Range && item.range.isEqual(activeRange)
    )

    if (activeItem) {
        // Update the label of the active item
        activeItem.label = activeItem.label.replace(
            QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
            QUICK_PICK_ITEM_CHECKED_PREFIX
        )
    }

    if (!symbolItems || symbolItems.length === 0) {
        return { items: defaultItems, activeItem }
    }

    return {
        items: [
            { label: 'ranges', kind: vscode.QuickPickItemKind.Separator },
            ...defaultItems,
            { label: 'symbols', kind: vscode.QuickPickItemKind.Separator },
            ...symbolItems,
        ],
        activeItem,
    }
}
