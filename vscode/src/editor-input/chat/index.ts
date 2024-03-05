import * as vscode from 'vscode'
import type { InputType } from '..'
import { executeExplainCommand, executeSmellCommand } from '../../commands/execute'
import type { AuthProvider } from '../../services/AuthProvider'
import { type InitialValues, type OutputValues, showEditorInput } from '../shared/create-input'

const EXPLAIN_ITEM: vscode.QuickPickItem = {
    label: '$(book) Explain Code',
    alwaysShow: true,
}

const SMELL_ITEM: vscode.QuickPickItem = {
    label: '$(checklist) Find Code Smells',
    alwaysShow: true,
}

const ADD_TO_CHAT_ITEM: vscode.QuickPickItem = {
    label: '$(new-comment-icon) Add selection to Current Chat (⇧⌥L)',
    alwaysShow: true,
}

export const showChatInput = (
    document: vscode.TextDocument,
    authProvider: AuthProvider,
    initialValues: InitialValues['Chat'],
    inputType: InputType = 'NoPrefix'
): Promise<OutputValues['Chat']> => {
    return new Promise(resolve => {
        showEditorInput<'Chat'>({
            type: 'Chat',
            inputType,
            document,
            authProvider,
            initialValues,
            additionalItems: [
                {
                    label: 'current chat',
                    kind: vscode.QuickPickItemKind.Separator,
                },
                ADD_TO_CHAT_ITEM,
                {
                    label: 'chat commands',
                    kind: vscode.QuickPickItemKind.Separator,
                },
                EXPLAIN_ITEM,
                SMELL_ITEM,
            ],
            onDidAccept: async (args, ref) => {
                const selectedItem = ref.selectedItems[0]
                switch (selectedItem.label) {
                    case ADD_TO_CHAT_ITEM.label:
                        // TOOD: Support chat command to add a selected item, without triggering a new chat
                        return
                    case EXPLAIN_ITEM.label:
                        void executeExplainCommand({ source: 'editor' })
                        return
                    case SMELL_ITEM.label:
                        void executeSmellCommand({ source: 'editor' })
                        return
                }

                resolve(args)
            },
        })
    })
}
