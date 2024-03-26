import * as vscode from 'vscode'
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

export const CHAT_ITEMS = [EXPLAIN_ITEM, SMELL_ITEM]
export const handleChatItemAcceptance = (item: vscode.QuickPickItem): void => {
    switch (item.label) {
        case EXPLAIN_ITEM.label:
            void executeExplainCommand({ source: 'editor' })
            return
        case SMELL_ITEM.label:
            void executeSmellCommand({ source: 'editor' })
            return
    }
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
                ...CHAT_ITEMS,
            ],
            onDidAccept: async (args, ref) => {
                const selectedItem = ref.selectedItems[0]
                handleChatItemAcceptance(selectedItem)
                resolve(args)
            },
        })
    })
}
