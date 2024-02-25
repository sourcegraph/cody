import * as vscode from 'vscode'

export interface GetItemsResult {
    items: vscode.QuickPickItem[]
    activeItem?: vscode.QuickPickItem
}

interface QuickPickConfiguration {
    title: string
    placeHolder: string
    onDidAccept: (item?: vscode.QuickPickItem) => void
    onDidChangeActive?: (items: readonly vscode.QuickPickItem[]) => void
    onDidChangeValue?: (value: string) => void
    onDidHide?: () => void
    getItems: () => GetItemsResult | Promise<GetItemsResult>
    value?: string
    buttons?: vscode.QuickInputButton[]
    onDidTriggerButton?: (target: vscode.QuickInputButton) => void
}

interface QuickPick {
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
    onDidTriggerButton,
    getItems,
    buttons,
    value = '',
}: QuickPickConfiguration): QuickPick => {
    const quickPick = vscode.window.createQuickPick()
    quickPick.title = title
    quickPick.placeholder = placeHolder
    quickPick.value = value
    quickPick.onDidAccept(() => onDidAccept(quickPick.activeItems[0]))

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
                itemsOrPromise.then(({ items, activeItem }) => {
                    quickPick.items = items
                    if (activeItem) {
                        quickPick.activeItems = [activeItem]
                    }
                    quickPick.busy = false
                })
            } else {
                quickPick.items = itemsOrPromise.items
                if (itemsOrPromise.activeItem) {
                    quickPick.activeItems = [itemsOrPromise.activeItem]
                }
            }

            quickPick.show()
        },
    }
}
