import { QuickPickItem, window } from 'vscode'

import { menu_options } from '../utils/menu'

export class CommandsMainMenu {
    public id = 'main'

    public static async show(items: QuickPickItem[]): Promise<QuickPickItem> {
        const options = {
            title: 'Cody Commands',
            placeHolder: 'Search for a command',
            ignoreFocusOut: true,
        }

        return new Promise(resolve => {
            let input = ''
            const quickPick = window.createQuickPick()
            quickPick.items = items
            quickPick.title = options.title
            quickPick.placeholder = options.placeHolder
            quickPick.ignoreFocusOut = options.ignoreFocusOut

            const labels = new Set(items.map(item => item.label))
            quickPick.onDidChangeValue(() => {
                if (quickPick.value && !labels.has(quickPick.value)) {
                    quickPick.items = [menu_options.submit, ...items]
                    input = quickPick.value
                    return
                }
                quickPick.items = items
            })

            quickPick.onDidAccept(() => {
                const selection = quickPick.activeItems[0]
                if (selection.label === 'Submit question') {
                    selection.detail = input
                }
                resolve(selection)
                quickPick.hide()
            })
            quickPick.show()
        })
    }
}
