import * as vscode from 'vscode'

export interface GetItemsResult<T extends vscode.QuickPickItem = vscode.QuickPickItem> {
    items: T[]
    activeItem?: T | T[]
}

type QuickPickConfiguration<T extends vscode.QuickPickItem = vscode.QuickPickItem> = {
    title: string
    placeHolder: string
    canSelectMany?: boolean
    onDidChangeActive?: (items: readonly T[]) => void
    onDidChangeValue?: (value: string) => void
    onDidHide?: () => void
    getItems: () => GetItemsResult<T> | Promise<GetItemsResult<T>>
    value?: string
    buttons?: vscode.QuickInputButton[]
    onDidTriggerButton?: (target: vscode.QuickInputButton) => void
} & (
    | { canSelectMany: true; onDidAccept: (items: readonly T[]) => void }
    | { canSelectMany?: false; onDidAccept: (item: T) => void }
)

interface QuickPick<T extends vscode.QuickPickItem = vscode.QuickPickItem> {
    input: vscode.QuickPick<T>
    render: (value: string) => void
}

export const createQuickPick = <T extends vscode.QuickPickItem = vscode.QuickPickItem>({
    title,
    canSelectMany,
    placeHolder,
    onDidAccept,
    onDidChangeActive,
    onDidChangeValue,
    onDidHide,
    onDidTriggerButton,
    getItems,
    buttons,
    value = '',
}: QuickPickConfiguration<T>): QuickPick<T> => {
    const quickPick = vscode.window.createQuickPick<T>()
    quickPick.canSelectMany = canSelectMany ?? false
    quickPick.ignoreFocusOut = true
    quickPick.title = title
    quickPick.placeholder = placeHolder
    quickPick.value = value
    quickPick.onDidAccept(() => {
        //TODO: This is an artifact from that we can dynamically switch single/multi select
        if (canSelectMany) {
            if (quickPick.canSelectMany) {
                // if there are no selected items but the user still pressed
                // enter with a item selected we assume they just wanted to pick
                // that one
                if (quickPick.selectedItems.length === 0) {
                    onDidAccept([quickPick.activeItems[0]])
                } else {
                    onDidAccept(quickPick.selectedItems)
                }
            } else {
                onDidAccept([quickPick.activeItems[0]])
            }
        } else {
            if (quickPick.canSelectMany) {
                throw new Error(
                    'QuickPick does not have canSelectMany enabled but multiple items could be selected'
                )
            }
            onDidAccept(quickPick.activeItems[0])
        }
    })

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
        render: value => {
            quickPick.value = value

            const updateActiveItems = (item?: T | T[]) => {
                if (!item) {
                    return
                }
                // We check the actual value set on the quickPick as it could have changed.
                if (quickPick.canSelectMany) {
                    quickPick.selectedItems = Array.isArray(item) ? item : [item]
                } else {
                    quickPick.activeItems = Array.isArray(item) ? item : [item]
                }
            }
            const itemsOrPromise = getItems()
            if (itemsOrPromise instanceof Promise) {
                quickPick.busy = true
                itemsOrPromise.then(({ items, activeItem }) => {
                    quickPick.items = items
                    updateActiveItems(activeItem)
                    quickPick.busy = false
                })
            } else {
                quickPick.items = itemsOrPromise.items
                updateActiveItems(itemsOrPromise.activeItem)
            }

            quickPick.show()
        },
    }
}
