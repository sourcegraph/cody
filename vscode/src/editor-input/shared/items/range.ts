import * as vscode from 'vscode'
import { getEditSmartSelection } from '../../../edit/utils/edit-selection'
import { QUICK_PICK_ITEM_CHECKED_PREFIX, QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX } from '../constants'
import type { GetItemsResult } from '../quick-pick'
import { CURSOR_RANGE_ITEM, EXPANDED_RANGE_ITEM, SELECTION_RANGE_ITEM } from './constants'
import type { RangeItem } from './types'
import { isGenerateIntent } from '../../../edit/utils/edit-intent'
import { RANGE_SYMBOLS_ITEM } from './range-symbols'
import type { EditorInputType } from '../create-input'

export const RANGE_ITEM: vscode.QuickPickItem = {
    label: 'Range',
    alwaysShow: true,
}

const getDefaultRangeItems = (
    type: EditorInputType,
    document: vscode.TextDocument,
    initialValues: RangeInputInitialValues
): RangeItem[] => {
    const { initialRange, initialExpandedRange, initialCursorPosition } = initialValues

    const everPresentItems: RangeItem[] =
        type === 'Chat'
            ? []
            : [
                  {
                      ...CURSOR_RANGE_ITEM,
                      range: new vscode.Range(initialCursorPosition, initialCursorPosition),
                  },
              ]

    if (initialExpandedRange) {
        // No need to show the selection (it will be the same as the expanded range)
        return [
            ...everPresentItems,
            {
                ...EXPANDED_RANGE_ITEM,
                range: initialExpandedRange,
            },
        ]
    }

    if (isGenerateIntent(document, initialRange)) {
        // No need to show the selection (it will be the same as the cursor position)
        return [
            ...everPresentItems,
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
        ...everPresentItems,
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

interface RangeInputInitialValues {
    initialCursorPosition: vscode.Position
    initialRange: vscode.Range
    initialExpandedRange?: vscode.Range
}

export const getRangeInputItems = async (
    type: EditorInputType,
    document: vscode.TextDocument,
    initialValues: RangeInputInitialValues,
    activeRange: vscode.Range
): Promise<GetItemsResult> => {
    const defaultItems = getDefaultRangeItems(type, document, initialValues).map(item => ({
        ...item,
        label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${item.label}`,
    }))

    const activeItem = defaultItems.find(
        item => item.range instanceof vscode.Range && item.range.isEqual(activeRange)
    )

    if (activeItem) {
        // Update the label of the active item
        activeItem.label = activeItem.label.replace(
            QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
            QUICK_PICK_ITEM_CHECKED_PREFIX
        )
    }

    return {
        items: [
            { label: 'ranges', kind: vscode.QuickPickItemKind.Separator },
            ...defaultItems,
            { label: 'symbols', kind: vscode.QuickPickItemKind.Separator },
            RANGE_SYMBOLS_ITEM,
        ],
        activeItem,
    }
}
