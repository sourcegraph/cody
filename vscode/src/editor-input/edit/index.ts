import * as vscode from 'vscode'
import type { AuthProvider } from '../../services/AuthProvider'
import { type InitialValues, type OutputValues, showEditorInput } from '../shared/create-input'

const DOCUMENT_ITEM: vscode.QuickPickItem = {
    label: '$(book) Document Code',
    alwaysShow: true,
}

const TEST_ITEM: vscode.QuickPickItem = {
    label: '$(package) Generate Tests',
    alwaysShow: true,
}

export const EDIT_ITEMS = [DOCUMENT_ITEM, TEST_ITEM]
export const handleEditItemAcceptance = (
    item: vscode.QuickPickItem,
    document: vscode.TextDocument,
    range: vscode.Range
): void => {
    switch (item.label) {
        case DOCUMENT_ITEM.label:
            vscode.commands.executeCommand('cody.command.document-code')
            return
        case TEST_ITEM.label:
            vscode.commands.executeCommand('cody.command.unit-tests')
            return
    }
}

export const showEditInput = (
    document: vscode.TextDocument,
    authProvider: AuthProvider,
    initialValues: InitialValues['Edit']
): Promise<OutputValues['Edit']> => {
    return new Promise(resolve => {
        showEditorInput<'Edit'>({
            type: 'Edit',
            document,
            authProvider,
            initialValues,
            additionalItems: [
                {
                    label: 'edit commands',
                    kind: vscode.QuickPickItemKind.Separator,
                },
                ...EDIT_ITEMS,
            ],
            onDidAccept: async (args, ref) => {
                const selectedItem = ref.selectedItems[0]
                handleEditItemAcceptance(selectedItem, document, args.range)
                resolve(args)
            },
        })
    })
}
