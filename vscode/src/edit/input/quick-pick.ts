import * as vscode from 'vscode'

interface QuickPickConfiguration {
    title: string
    placeHolder: string
    onDidAccept: () => void
    onDidChangeActive?: (items: readonly vscode.QuickPickItem[]) => void
    onDidChangeValue?: (value: string) => void
    getItems?: () => vscode.QuickPickItem[]
    value?: string
    buttons?: vscode.QuickInputButton[]
    onDidTriggerButton?: (target: vscode.QuickInputButton) => void
}

export const createQuickPick = ({
    title,
    placeHolder,
    onDidAccept,
    onDidChangeActive,
    onDidChangeValue,
    getItems,
    value = '',
}: QuickPickConfiguration): {
    input: vscode.QuickPick<vscode.QuickPickItem>
    render: (title: string, value: string) => void
} => {
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

    quickPick.matchOnDescription = false
    quickPick.matchOnDetail = false

    return {
        input: quickPick,
        render: (title, value) => {
            quickPick.title = title
            quickPick.value = value
            quickPick.items = getItems ? getItems() : []
            quickPick.show()
        },
    }
}
