import * as vscode from 'vscode'

import { FixupIntent } from '@sourcegraph/cody-shared/src/chat/recipes/fixup'

import { FixupTask } from './FixupTask'
import { FixupTaskFactory } from './roles'

type FixupCommand = `/${FixupIntent}`
interface FixupQuickPickItem {
    description: string
    placeholder: string
    /**
     * Optional value to insert.
     * Some commands (like /document) are self explanatory and a user might not want to write anything
     **/
    value?: string
}

const FixupCommands = new Map<FixupCommand, FixupQuickPickItem>([
    [
        '/fix',
        {
            description: 'Fix a problem in the selected code',
            placeholder: 'Describe what you want Cody to fix',
            value: 'Fix any problems in the selected code',
        },
    ],
    [
        '/document',
        {
            description: 'Generate documentation or comments for the selected code',
            placeholder: 'Describe what you want Cody to do',
            value: 'Generate documentation or comments for the selected code',
        },
    ],
])

const FixupQuickPickItems: vscode.QuickPickItem[] = [...FixupCommands].map(([command, item]) => ({
    label: command,
    ...item,
}))

/**
 * The UI for creating non-stop fixup tasks by typing instructions.
 */
export class FixupTypingUI {
    constructor(private readonly taskFactory: FixupTaskFactory) {}

    private async getInstructionFromQuickPick({
        title = 'Cody',
        placeholder = "Ask Cody to do something, or type ' / ' for commands",
        value = '',
        prefix = '',
    } = {}): Promise<string> {
        const quickPick = vscode.window.createQuickPick()
        quickPick.title = title
        quickPick.placeholder = placeholder
        quickPick.buttons = [{ tooltip: 'Cody', iconPath: new vscode.ThemeIcon('cody-logo-heavy') }]
        quickPick.ignoreFocusOut = true
        quickPick.value = value

        // VS Code automatically sorts quick pick items by label.
        // We want the 'edit' item to always be first, so we remove this.
        // Property not currently documented, open issue: https://github.com/microsoft/vscode/issues/73904
        ;(quickPick as any).sortByLabel = false

        quickPick.onDidTriggerButton(() => {
            void vscode.commands.executeCommand('cody.focus')
            quickPick.hide()
        })

        quickPick.onDidChangeValue(value => {
            if (value.startsWith('/')) {
                quickPick.items = FixupQuickPickItems
            } else {
                // We show no items by default
                quickPick.items = []
            }
        })

        quickPick.show()

        return new Promise(resolve =>
            quickPick.onDidAccept(() => {
                const selectedItem = quickPick.selectedItems[0]?.label
                const command = FixupCommands.get(selectedItem as FixupCommand)
                if (command) {
                    return resolve(
                        this.getInstructionFromQuickPick({
                            title: `Cody - ${selectedItem}`,
                            placeholder: command.placeholder,
                            value: command.value,
                            prefix: selectedItem,
                        })
                    )
                }

                const instruction = quickPick.value.trim()
                if (!instruction) {
                    // noop
                    return
                }

                quickPick.hide()
                return resolve(prefix ? `${prefix} ${instruction}` : instruction)
            })
        )
    }

    public async show(): Promise<FixupTask | null> {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return null
        }
        const range = editor.selection
        const instruction = (await this.getInstructionFromQuickPick())?.trim()
        if (!instruction) {
            return null
        }
        const CHAT_RE = /^\/chat(|\s.*)$/
        const match = instruction.match(CHAT_RE)
        if (match?.[1]) {
            // If we got here, we have a selection; start chat with match[1].
            await vscode.commands.executeCommand('cody.action.chat', match[1])
            return null
        }

        const task = this.taskFactory.createTask(editor.document.uri, instruction, range)

        // Return focus to the editor
        void vscode.window.showTextDocument(editor.document)

        return task
    }
}
