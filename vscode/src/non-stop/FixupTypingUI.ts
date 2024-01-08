import * as vscode from 'vscode'

import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { EDIT_COMMAND, menu_buttons } from '../commands/utils/menu'
import { ExecuteEditArguments } from '../edit/execute'
import { getEditor } from '../editor/active-editor'

import { FixupTask } from './FixupTask'
import { FixupTaskFactory } from './roles'

/**
 * The UI for creating non-stop fixup tasks by typing instructions.
 */
export class FixupTypingUI {
    constructor(private readonly taskFactory: FixupTaskFactory) {}

    public async getInstructionFromQuickPick({
        title = `${EDIT_COMMAND.description} (${EDIT_COMMAND.slashCommand})`,
        placeholder = 'Your instructions',
        value = '',
        prefix = EDIT_COMMAND.slashCommand,
    } = {}): Promise<string> {
        const quickPick = vscode.window.createQuickPick()
        quickPick.title = title
        quickPick.placeholder = placeholder
        quickPick.buttons = [menu_buttons.back]
        quickPick.value = value

        // VS Code automatically sorts quick pick items by label.
        // We want the 'edit' item to always be first, so we remove this.
        // Property not currently documented, open issue: https://github.com/microsoft/vscode/issues/73904
        ;(quickPick as any).sortByLabel = false

        quickPick.onDidTriggerButton(() => {
            void vscode.commands.executeCommand('cody.action.commands.menu')
            quickPick.hide()
        })

        quickPick.show()

        return new Promise(resolve =>
            quickPick.onDidAccept(() => {
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

    public async show(args: ExecuteEditArguments, source: ChatEventSource): Promise<FixupTask | null> {
        const editor = getEditor().active
        if (!editor) {
            return null
        }
        const document = args.document || editor?.document
        const range = args.range || editor?.selection
        if (!document || !range) {
            return null
        }
        const instruction = (await this.getInstructionFromQuickPick())?.trim()
        if (!instruction) {
            return null
        }
        const CHAT_RE = /^\/chat(|\s.*)$/
        const match = instruction.match(CHAT_RE)
        if (match?.[1]) {
            // If we got here, we have a selection; start chat with match[1].
            await vscode.commands.executeCommand('cody.action.chat', match[1], 'fixup')
            return null
        }

        const task = this.taskFactory.createTask(document.uri, instruction, range, args.intent, args.insertMode, source)

        // Return focus to the editor
        void vscode.window.showTextDocument(document)

        return task
    }
}
