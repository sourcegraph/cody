import * as vscode from 'vscode'
import { getEditSmartSelection } from '../../utils/edit-selection'
import type { EditInputInitialValues } from '../get-input'
import type { GetItemsResult } from '../quick-pick'
import { EXPANDED_RANGE_ITEM, SELECTION_RANGE_ITEM } from './constants'
import type { EditRangeItem } from './types'
import { symbolIsFunctionLike, symbolIsVariableLike } from './utils'

const getDefaultDocumentItems = (
    document: vscode.TextDocument,
    initialValues: EditInputInitialValues
): EditRangeItem[] => {
    const { initialRange, initialExpandedRange } = initialValues

    if (initialExpandedRange) {
        // No need to show the selection (it will be the same)
        return [
            {
                ...EXPANDED_RANGE_ITEM,
                range: initialExpandedRange,
            },
        ]
    }

    return [
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

export const getDocumentInputItems = async (
    document: vscode.TextDocument,
    initialValues: EditInputInitialValues,
    activeRange: vscode.Range,
    symbolsPromise: Thenable<vscode.DocumentSymbol[]>
): Promise<GetItemsResult> => {
    const defaultItems = getDefaultDocumentItems(document, initialValues)

    const symbols = await symbolsPromise
    const symbolItems: EditRangeItem[] = symbols
        .filter(sym => symbolIsFunctionLike(sym) || symbolIsVariableLike(sym))
        .map(symbol => {
            const icon = symbolIsFunctionLike(symbol) ? '$(symbol-method)' : '$(symbol-variable)'
            return {
                label: `${icon} ${symbol.name}`,
                range: symbol.range,
                selectionRange: symbol.selectionRange,
            }
        })

    const wrappingSymbol = symbolItems.find(
        item => item.range instanceof vscode.Range && item.range.contains(initialValues.initialRange)
    )

    const activeItem =
        wrappingSymbol ||
        defaultItems.find(item => item.range instanceof vscode.Range && item.range.isEqual(activeRange))

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
