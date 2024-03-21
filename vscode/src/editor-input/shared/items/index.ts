import * as vscode from 'vscode'
import type { EditorInputType } from '../create-input'
import type { GetItemsResult } from '../quick-pick'
import { getItemLabel } from '../utils'
import { MODEL_ITEM } from './model'
import { RANGE_ITEM } from './range'
import type { ModelItem } from './types'
import { EditorInputTypeToModelType } from '../constants'

const SUBMIT_SEPARATOR: vscode.QuickPickItem = {
    label: 'submit',
    kind: vscode.QuickPickItemKind.Separator,
}

const DEFAULT_SUBMIT_ITEM: vscode.QuickPickItem = {
    label: 'Submit',
    alwaysShow: true,
}

const getSubmitModelWarning = (
    type: EditorInputType,
    activeModelItem?: ModelItem
): string | undefined => {
    const modelUsage = EditorInputTypeToModelType[type].type
    if (!activeModelItem) {
        return
    }

    const validModelItem = activeModelItem.usage.includes(modelUsage)
    if (validModelItem) {
        return
    }

    return `$(warning) ${activeModelItem.modelTitle} is not supported for ${type}`
}

const getSubmitActions = (
    inputType: EditorInputType,
    activeModelItem?: ModelItem
): vscode.QuickPickItem[] => {
    switch (inputType) {
        case 'Combined': {
            return [
                {
                    ...DEFAULT_SUBMIT_ITEM,
                    label: `${DEFAULT_SUBMIT_ITEM.label} Edit Instruction`,
                    detail: getSubmitModelWarning('Edit', activeModelItem),
                },
                {
                    ...DEFAULT_SUBMIT_ITEM,
                    label: `${DEFAULT_SUBMIT_ITEM.label} Chat Message`,
                    detail: getSubmitModelWarning('Chat', activeModelItem),
                },
            ]
        }
        case 'Edit':
            return [
                {
                    ...DEFAULT_SUBMIT_ITEM,
                    label: `${DEFAULT_SUBMIT_ITEM.label} Edit Instruction (⏎)`,
                    detail: '(or type @ to include code)',
                },
            ]
        case 'Chat':
            return [
                {
                    ...DEFAULT_SUBMIT_ITEM,
                    label: `${DEFAULT_SUBMIT_ITEM.label} Chat Message (⏎)`,
                    detail: '(or type @ to include code)',
                },
            ]
    }
}

export const getSharedInputItems = (
    type: EditorInputType,
    activeValue: string,
    activeRangeItem: vscode.QuickPickItem,
    activeModelItem: ModelItem | undefined,
    showModelSelector: boolean,
    additionalItems: vscode.QuickPickItem[] = []
): GetItemsResult => {
    const hasActiveValue = activeValue.trim().length > 0

    const submitItems = hasActiveValue
        ? [SUBMIT_SEPARATOR, ...getSubmitActions(type, activeModelItem)]
        : []
    const optionItems = [
        {
            label: 'options',
            kind: vscode.QuickPickItemKind.Separator,
        },
        { ...RANGE_ITEM, detail: getItemLabel(activeRangeItem) },
        showModelSelector
            ? {
                  ...MODEL_ITEM,
                  detail: activeModelItem ? getItemLabel(activeModelItem) : undefined,
              }
            : null,
    ]

    const items = [...submitItems, ...optionItems, ...additionalItems].filter(
        Boolean
    ) as vscode.QuickPickItem[]

    return { items }
}
