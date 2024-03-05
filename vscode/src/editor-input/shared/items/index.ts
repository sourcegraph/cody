import * as vscode from 'vscode'
import type { InputType } from '../..'
import type { EditorInputType } from '../create-input'
import type { GetItemsResult } from '../quick-pick'
import { getItemLabel } from '../utils'
import { MODEL_ITEM } from './model'
import { RANGE_ITEM } from './range'

const SUBMIT_SEPARATOR: vscode.QuickPickItem = {
    label: 'submit',
    kind: vscode.QuickPickItemKind.Separator,
}
const SUBMIT_ITEM: vscode.QuickPickItem = {
    label: 'Submit (⏎)',
    alwaysShow: true,
}

export const getSharedInputItems = (
    type: EditorInputType,
    inputType: InputType,
    activeValue: string,
    activeRangeItem: vscode.QuickPickItem,
    activeModelItem: vscode.QuickPickItem | undefined,
    showModelSelector: boolean,
    additionalItems: vscode.QuickPickItem[] = []
): GetItemsResult => {
    const hasActiveValue = activeValue.trim().length > 0

    const hintItems =
        inputType === 'NoPrefix' || inputType === 'Hybrid' || hasActiveValue
            ? []
            : type === 'Chat'
              ? [{ label: 'Enter chat message (@ to include code)', alwaysShow: true }]
              : [{ label: 'Enter edit instructions (@ to include code)', alwaysShow: true }]

    const submitItems = hasActiveValue
        ? [
              SUBMIT_SEPARATOR,
              {
                  ...SUBMIT_ITEM,
                  detail:
                      type === 'Chat'
                          ? 'Start new chat (or type @ to include code)'
                          : 'Submit edit instruction (or type @ to include code)',
              },
          ]
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

    const items = [...hintItems, ...submitItems, ...optionItems, ...additionalItems].filter(
        Boolean
    ) as vscode.QuickPickItem[]

    return { items }
}
