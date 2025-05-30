import * as vscode from 'vscode'
import {
    QUICK_PICK_ITEM_CHECKED_PREFIX,
    QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX,
} from '../../../chat/context/constants'
import { isGenerateIntent } from '../../utils/edit-intent'
import { getEditSmartSelection } from '../../utils/edit-selection'
import type { EditInput } from '../get-input'
import type { GetItemsResult } from '../quick-pick'
import {
    CURSOR_RANGE_ITEM,
    EXPANDED_RANGE_ITEM,
    FULL_RANGE_ITEM,
    SELECTION_RANGE_ITEM,
} from './constants'
import { RANGE_SYMBOLS_ITEM } from './range-symbols'
import type { EditRangeItem } from './types'

const getDefaultRangeItems = (
    document: vscode.TextDocument,
    initialValues: EditInput,
    cursorPosition: vscode.Position
): EditRangeItem[] => {
    const { range, expandedRange } = initialValues

    const cursorItem = {
        ...CURSOR_RANGE_ITEM,
        range: new vscode.Range(cursorPosition, cursorPosition),
    }

    const fullItem = {
        ...FULL_RANGE_ITEM,
        range: document.validateRange(new vscode.Range(0, 0, document.lineCount + 1, 0)),
    }

    if (expandedRange) {
        // No need to show the selection (it will be the same as the expanded range)
        return [
            cursorItem,
            {
                ...EXPANDED_RANGE_ITEM,
                range: expandedRange,
            },
            fullItem,
        ]
    }

    if (isGenerateIntent(document, range)) {
        // No need to show the selection (it will be the same as the cursor position)
        return [
            cursorItem,
            {
                ...EXPANDED_RANGE_ITEM,
                range: async () =>
                    getEditSmartSelection(document, range, {
                        forceExpand: true,
                    }),
            },
            fullItem,
        ]
    }

    return [
        cursorItem,
        {
            ...SELECTION_RANGE_ITEM,
            range: range,
        },
        {
            ...EXPANDED_RANGE_ITEM,
            range: async () =>
                getEditSmartSelection(document, range, {
                    forceExpand: true,
                }),
        },
        fullItem,
    ]
}

export const getRangeInputItems = async (
    document: vscode.TextDocument,
    initialValues: EditInput,
    activeRange: vscode.Range,
    activeModelContextWindow: number
): Promise<GetItemsResult> => {
    const defaultItems = getDefaultRangeItems(document, initialValues, activeRange.start).map(item => {
        const size =
            item.range instanceof vscode.Range
                ? document.offsetAt(item.range.end) - document.offsetAt(item.range.start)
                : -1
        const isOverLimit = size > activeModelContextWindow
        return {
            ...item,
            label: `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} ${item.label}`,
            detail: isOverLimit
                ? `${QUICK_PICK_ITEM_EMPTY_INDENT_PREFIX} Selection too large`
                : undefined,
        }
    })

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
