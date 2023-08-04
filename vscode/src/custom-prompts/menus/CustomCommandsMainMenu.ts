import { QuickPickItem, QuickPickOptions, window } from 'vscode'

export class CustomCommandsMainMenu {
    public id = 'custom'

    public static async show(items: QuickPickItem[]): Promise<QuickPickItem> {
        const CustomCommandsMenuOptions: QuickPickOptions = {
            title: 'Cody Custom Commands (Experimental)',
            placeHolder: 'Search command to run...',
            ignoreFocusOut: true,
        }

        return new Promise(resolve => {
            const quickPick = window.createQuickPick()
            quickPick.items = items
            quickPick.title = CustomCommandsMenuOptions.title
            quickPick.placeholder = CustomCommandsMenuOptions.placeHolder
            quickPick.ignoreFocusOut = true

            quickPick.onDidAccept(() => {
                const selection = quickPick.activeItems[0]
                resolve(selection)
                quickPick.hide()
            })
            quickPick.show()
        })
    }
}
