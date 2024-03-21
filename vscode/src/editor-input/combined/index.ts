import * as vscode from 'vscode'
import type { AuthProvider } from '../../services/AuthProvider'
import { CHAT_ITEMS, handleChatItemAcceptance } from '../chat'
import { EDIT_ITEMS, handleEditItemAcceptance } from '../edit'
import { type InitialValues, type OutputValues, showEditorInput } from '../shared/create-input'

const CUSTOM_COMMAND_ITEM: vscode.QuickPickItem = {
    label: '$(tools) Custom Commands...',
    alwaysShow: true,
}

export const showCombinedInput = (
    document: vscode.TextDocument,
    authProvider: AuthProvider,
    initialValues: InitialValues['Combined']
): Promise<OutputValues['Combined']> => {
    return new Promise(resolve => {
        showEditorInput<'Combined'>({
            type: 'Combined',
            document,
            authProvider,
            initialValues,
            additionalItems: [
                {
                    label: 'commands',
                    kind: vscode.QuickPickItemKind.Separator,
                },
                ...EDIT_ITEMS,
                ...CHAT_ITEMS,
                CUSTOM_COMMAND_ITEM,
            ],
            onDidAccept: async (args, ref) => {
                const selectedItem = ref.selectedItems[0]
                handleEditItemAcceptance(selectedItem, document, args.range)
                handleChatItemAcceptance(selectedItem)
                if (selectedItem.label === CUSTOM_COMMAND_ITEM.label) {
                    vscode.commands.executeCommand('cody.menu.custom-commands')
                }
                resolve(args)
            },
        })
    })
}
