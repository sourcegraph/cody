import type { ChatEventSource } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ChatManager } from '../chat/chat-view/ChatManager'
import type { EditManager } from '../edit/manager'
import { getEditor } from '../editor/active-editor'
import { getSmartSelection } from '../editor/utils'
import type { AuthProvider } from '../services/AuthProvider'
import { showCombinedInput } from './combined'

interface GetInputParams {
    document: vscode.TextDocument
    source: ChatEventSource
    editManager: EditManager
    chatManager: ChatManager
}

export const registerEditorInput = (authProvider: AuthProvider): vscode.Disposable => {
    return vscode.commands.registerCommand(
        'cody.editor.input',
        async (params: Partial<GetInputParams> = {}) => {
            // We can't be sure params exist here, as the command may be triggered by a keybinding.
            // Rebuild the InputParams using sensible defaults
            const editor = getEditor()
            if (editor.ignored) {
                void vscode.window.showInformationMessage('This file is ignored by Cody.')
                return
            }

            const document = params.document || editor.active?.document
            if (!document) {
                // TODO: Support no document?
                void vscode.window.showErrorMessage('Please open a file.')
                return
            }

            const initialRange = editor.active?.selection
            if (!initialRange) {
                return
            }

            let initialExpandedRange: vscode.Range | undefined
            // Support expanding the selection range for intents where it is useful
            const smartRange = await getSmartSelection(document, initialRange.start.line)
            if (smartRange && !smartRange.isEqual(initialRange)) {
                initialExpandedRange = smartRange
            }

            // const source = params.source || 'editor'

            return showCombinedInput(document, authProvider, {
                initialModel: 'anthropic/claude-2.0',
                initialRange,
                initialExpandedRange,
                initialSelectedContextItems: [],
            })
        }
    )
}
