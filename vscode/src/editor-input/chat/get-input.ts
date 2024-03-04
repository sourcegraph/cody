import * as vscode from 'vscode'
import { type InitialValues, type OutputValues, showEditorInput } from '../shared/create-input'
import type { AuthProvider } from '../../services/AuthProvider'
import { executeExplainCommand, executeSmellCommand } from '../../commands/execute'

export const EXPLAIN_ITEM: vscode.QuickPickItem = {
    label: 'Explain Code',
    alwaysShow: true,
}

export const SMELL_ITEM: vscode.QuickPickItem = {
    label: 'Find Code Smells',
    alwaysShow: true,
}

export const showChatInput = (
    document: vscode.TextDocument,
    authProvider: AuthProvider,
    initialValues: InitialValues['Chat']
): Promise<OutputValues['Chat']> => {
    return new Promise(resolve => {
        showEditorInput<'Chat'>({
            type: 'Chat',
            document,
            authProvider,
            initialValues,
            additionalItems: [
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
                    case EXPLAIN_ITEM.label:
                        void executeExplainCommand({ source: 'editor' })
                        return
                    case SMELL_ITEM.label:
                        void executeSmellCommand({ source: 'editor' })
                        return
                }

                resolve(args)
            }
        })
    })
}
