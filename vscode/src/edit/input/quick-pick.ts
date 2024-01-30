import * as vscode from 'vscode'

export interface GetItemsResult {
    items: vscode.QuickPickItem[]
    activeItems?: vscode.QuickPickItem[]
}

interface QuickPickConfiguration {
    title: string
    placeHolder: string
    onDidAccept: () => void
    onDidChangeActive?: (items: readonly vscode.QuickPickItem[]) => void
    onDidChangeValue?: (value: string) => void
    onDidHide?: () => void
    getItems: () => GetItemsResult | Promise<GetItemsResult>
    value?: string
    buttons?: vscode.QuickInputButton[]
    onDidTriggerButton?: (target: vscode.QuickInputButton) => void
}

export interface QuickPick {
    input: vscode.QuickPick<vscode.QuickPickItem>
    render: (title: string, value: string) => void
}

export const createQuickPick = ({
    title,
    placeHolder,
    onDidAccept,
    onDidChangeActive,
    onDidChangeValue,
    onDidHide,
    getItems,
    buttons,
    onDidTriggerButton,
    value = '',
}: QuickPickConfiguration): QuickPick => {
    const quickPick = vscode.window.createQuickPick()
    quickPick.title = title
    quickPick.placeholder = placeHolder
    quickPick.value = value
    quickPick.onDidAccept(onDidAccept)

    // VS Code automatically sorts quick pick items by label.
    // Property not currently documented, open issue: https://github.com/microsoft/vscode/issues/73904
    ;(quickPick as any).sortByLabel = false

    if (onDidChangeActive) {
        quickPick.onDidChangeActive(onDidChangeActive)
    }

    if (onDidChangeValue) {
        quickPick.onDidChangeValue(onDidChangeValue)
    }

    if (onDidHide) {
        quickPick.onDidHide(onDidHide)
    }

    if (buttons && onDidTriggerButton) {
        quickPick.buttons = buttons
        quickPick.onDidTriggerButton(onDidTriggerButton)
    }

    quickPick.matchOnDescription = false
    quickPick.matchOnDetail = false

    return {
        input: quickPick,
        render: (title, value) => {
            quickPick.title = title
            quickPick.value = value

            const itemsOrPromise = getItems()
            if (itemsOrPromise instanceof Promise) {
                quickPick.busy = true
                itemsOrPromise.then(({ items, activeItems }) => {
                    quickPick.items = items
                    if (activeItems) {
                        quickPick.activeItems = activeItems
                    }
                    quickPick.busy = false
                })
            } else {
                quickPick.items = itemsOrPromise.items
                if (itemsOrPromise.activeItems) {
                    quickPick.activeItems = itemsOrPromise.activeItems
                }
            }

            quickPick.show()
        },
    }
}
