import * as vscode from 'vscode'

import { FixupTask } from './FixupTask'
import { FixupTaskFactory } from './roles'

const FixupCommands = new Map([
    ['/fix', 'Fix a problem in the selected code'],
    ['/add', 'Suggest new code'],
    ['/edit', 'Edit the selected code'],
    ['/document', 'Generate documentation or comments for the selected code'],
    ['/remove', 'Remove parts of the selected code'],
    ['/test', 'Generate a test for the selected code'],
])
const FixupQuickPickItems = [...FixupCommands].map(([command, description]) => ({ label: command, description }))

/**
 * The UI for creating non-stop fixup tasks by typing instructions.
 */
export class FixupTypingUI {
    constructor(private readonly taskFactory: FixupTaskFactory) {}

    private async getInstructionFromQuickPick({
        title = 'Cody',
        placeholder = "Ask Cody to do something, or type ' / ' for commands",
        fallback = '',
        prefix = '',
    } = {}): Promise<string> {
        const quickPick = vscode.window.createQuickPick()
        quickPick.title = title
        quickPick.placeholder = placeholder
        quickPick.buttons = [{ tooltip: 'Cody', iconPath: new vscode.ThemeIcon('cody-logo-heavy') }]
        quickPick.ignoreFocusOut = true
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
                const command = FixupCommands.get(selectedItem)
                if (command) {
                    return resolve(
                        this.getInstructionFromQuickPick({
                            title: `Cody - ${selectedItem}`,
                            placeholder: command,
                            fallback: command,
                            prefix: selectedItem,
                        })
                    )
                }

                quickPick.hide()
                const instruction = quickPick.value.trim() || fallback
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
