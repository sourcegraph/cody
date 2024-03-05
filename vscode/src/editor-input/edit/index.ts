import * as vscode from 'vscode'
import { DEFAULT_INPUT_TYPE, type InputType } from '..'
import { commands as defaultCommands } from '../../commands/execute/cody.json'
import { executeEdit } from '../../edit/execute'
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

export const showEditInput = (
    document: vscode.TextDocument,
    authProvider: AuthProvider,
    initialValues: InitialValues['Edit'],
    inputType: InputType = DEFAULT_INPUT_TYPE
): Promise<OutputValues['Edit']> => {
    return new Promise(resolve => {
        showEditorInput<'Edit'>({
            type: 'Edit',
            inputType,
            document,
            authProvider,
            initialValues,
            additionalItems: [
                {
                    label: 'edit commands',
                    kind: vscode.QuickPickItemKind.Separator,
                },
                DOCUMENT_ITEM,
                TEST_ITEM,
            ],
            onDidAccept: async (args, ref) => {
                const selectedItem = ref.selectedItems[0]
                switch (selectedItem.label) {
                    case DOCUMENT_ITEM.label:
                        void executeEdit({
                            configuration: {
                                document,
                                instruction: defaultCommands.doc.prompt,
                                range: args.range,
                                intent: 'doc',
                                mode: 'insert',
                                contextMessages: [],
                                userContextFiles: [],
                            },
                            source: 'menu',
                        })
                        return
                    case TEST_ITEM.label:
                        // TODO: This should entirely run through `executeEdit` when
                        // the unit test command has fully moved over to Edit.
                        return vscode.commands.executeCommand('cody.command.unit-tests')
                }

                resolve(args)
            },
        })
    })
}
