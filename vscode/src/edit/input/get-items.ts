import * as vscode from 'vscode'
import type { EditInputParams } from './get-input'
import type { EditSupportedModels } from '../prompt'
import type { EditRangeSource } from '../types'
import type { GetItemsResult } from './quick-pick'

export const RANGE_ITEM: vscode.QuickPickItem = {
    label: 'Range',
    alwaysShow: true,
}

export const MODEL_ITEM: vscode.QuickPickItem = {
    label: 'Model',
    alwaysShow: true,
}

export const DOCUMENT_ITEM: vscode.QuickPickItem = {
    label: 'Document',
    detail: 'Add code documentation',
    alwaysShow: true,
}

export const TEST_ITEM: vscode.QuickPickItem = {
    label: 'Test',
    detail: 'Generate unit tests',
    alwaysShow: true,
}

export const CUSTOM_ITEM: vscode.QuickPickItem = {
    label: 'Custom',
    detail: 'Custom Edit Commands',
    alwaysShow: true,
}

const SUBMIT_ITEM: vscode.QuickPickItem = {
    label: 'Submit',
    detail: 'Enter your instructions (@ to include code)',
    alwaysShow: true,
}

export const getEditInputItems = (
    params: EditInputParams,
    activeValue: string,
    activeRange: EditRangeSource,
    activeModel: EditSupportedModels
): GetItemsResult => {
    const items: vscode.QuickPickItem[] = []

    if (activeValue.trim().length > 0) {
        items.push(SUBMIT_ITEM)
    }
    items.push({
        label: 'edit options',
        kind: vscode.QuickPickItemKind.Separator,
    })

    if (params.mode !== 'file' && params.mode !== 'insert') {
        items.push({ ...RANGE_ITEM, detail: RANGE_ITEMS[activeRange].label })
    }
    items.push({ ...MODEL_ITEM, detail: MODEL_ITEMS[activeModel].label })

    items.push(
        {
            label: 'commands',
            kind: vscode.QuickPickItemKind.Separator,
        },
        DOCUMENT_ITEM,
        TEST_ITEM,
        CUSTOM_ITEM
    )

    return {
        items,
    }
}

export const RANGE_ITEMS: Record<EditRangeSource, vscode.QuickPickItem> = {
    selection: {
        label: '$(code) Selection',
        alwaysShow: true,
    },
    expanded: {
        label: '$(file-code) Expanded selection',
        description: 'Expand the selection to the nearest block of code',
        alwaysShow: true,
    },
    maximum: {
        label: '$(symbol-file) Maximum',
        description: 'The maximum expanded selection',
        alwaysShow: true,
    },
} as const

export const getRangeInputItems = (activeRangeType: EditRangeSource): GetItemsResult => {
    const activeItem = RANGE_ITEMS[activeRangeType]
    const remainingItems = Object.entries(RANGE_ITEMS)
        .filter(([key]) => key !== activeRangeType)
        .map(([_, item]) => item)

    return {
        items: [
            {
                label: 'active',
                kind: vscode.QuickPickItemKind.Separator,
            },
            activeItem,
            {
                label: 'options',
                kind: vscode.QuickPickItemKind.Separator,
            },
            ...remainingItems,
        ],
    }
}

const MODEL_ITEMS: Record<EditSupportedModels, vscode.QuickPickItem> = {
    'anthropic/claude-2.1': {
        label: '$(anthropic-logo) Claude 2.1',
        description: 'by Anthropic',
        alwaysShow: true,
    },
    'anthropic/claude-instant-1.2': {
        label: '$(anthropic-logo) Claude Instant',
        description: 'by Anthropic',
        alwaysShow: true,
    },
} as const

export const getModelInputItems = (activeModel: EditSupportedModels): GetItemsResult => {
    const activeItem = MODEL_ITEMS[activeModel]
    const remainingItems = Object.entries(MODEL_ITEMS)
        .filter(([key]) => key !== activeModel)
        .map(([_, item]) => item)

    return {
        items: [
            {
                label: 'active',
                kind: vscode.QuickPickItemKind.Separator,
            },
            activeItem,
            {
                label: 'options',
                kind: vscode.QuickPickItemKind.Separator,
            },
            ...remainingItems,
        ],
    }
}

const symbolIsFunctionLike = (symbol: vscode.SymbolInformation) =>
    symbol.kind === vscode.SymbolKind.Function ||
    symbol.kind === vscode.SymbolKind.Class ||
    symbol.kind === vscode.SymbolKind.Method ||
    symbol.kind === vscode.SymbolKind.Constructor

export const DEFAULT_TEST_ITEM = {
    label: '$(code) Selection',
    alwaysShow: true,
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
        return { items: [DEFAULT_TEST_ITEM] }
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
            DEFAULT_TEST_ITEM,
        ],
        activeItems: activeItem ? [activeItem] : [DEFAULT_TEST_ITEM],
    }
}

const symbolIsVariableLike = (symbol: vscode.SymbolInformation) =>
    symbol.kind === vscode.SymbolKind.Constant ||
    symbol.kind === vscode.SymbolKind.Variable ||
    symbol.kind === vscode.SymbolKind.Property ||
    symbol.kind === vscode.SymbolKind.Enum ||
    symbol.kind === vscode.SymbolKind.Interface

export const DEFAULT_DOCUMENT_ITEM = {
    label: '$(code) Selection',
    alwaysShow: true,
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
    TEST_ITEMS_RANGE_MAP.clear()

    const symbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
        'vscode.executeDocumentSymbolProvider',
        document.uri
    )

    if (!symbols || symbols.length === 0) {
        return { items: [DEFAULT_DOCUMENT_ITEM] }
    }

    const relevantSymbols = symbols.filter(sym => symbolIsFunctionLike(sym) || symbolIsVariableLike(sym))
    // TODO: Improve so it actually finds the nearest, not the first containing
    const nearestSymbol = relevantSymbols.find(sym => sym.location.range.contains(activeRange.start))

    const items: vscode.QuickPickItem[] = []
    for (const symbol of relevantSymbols) {
        const item = { label: `$(symbol-method) ${symbol.name}` }
        DOCUMENT_ITEMS_RANGE_MAP.set(item, symbol.location.range)
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
            DEFAULT_DOCUMENT_ITEM,
        ],
        activeItems: activeItem ? [activeItem] : [DEFAULT_DOCUMENT_ITEM],
    }
}
