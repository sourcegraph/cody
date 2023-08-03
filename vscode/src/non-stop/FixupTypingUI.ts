import * as vscode from 'vscode'

import { FixupTask } from './FixupTask'
import { FixupTaskFactory } from './roles'

/**
 * The UI for creating non-stop fixup tasks by typing instructions.
 */
export class FixupTypingUI {
    constructor(private readonly taskFactory: FixupTaskFactory) {}

    public async show(): Promise<FixupTask | null> {
        const editor = vscode.window.activeTextEditor
        if (!editor) {
            return null
        }
        const range = editor.selection

        // TODO: Do not require any text to be selected
        if (range.isEmpty) {
            await vscode.window.showWarningMessage('Select some text to fix up')
            return null
        }

        const CHAT_COMMAND = '/chat'
        const CHAT_RE = /^\/chat(|\s.*)$/
        const instruction = (
            await vscode.window.showInputBox({
                title: `Ask Cody to edit your code, or use ${CHAT_COMMAND} to ask a question`,
            })
        )?.trim()
        if (!instruction) {
            return null
        }
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
