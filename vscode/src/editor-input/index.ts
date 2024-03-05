import type { ChatEventSource } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'
import type { ChatManager } from '../chat/chat-view/ChatManager'
import { executeEdit } from '../edit/execute'
import type { EditManager } from '../edit/manager'
import { getEditor } from '../editor/active-editor'
import { isRunningInsideAgent } from '../jsonrpc/isRunningInsideAgent'
import type { AuthProvider } from '../services/AuthProvider'
import { showSearchInput } from './search'
import { type GetItemsResult, createQuickPick } from './shared/quick-pick'

const CHAT_ITEM_PREFIX: vscode.QuickPickItem = {
    label: '?',
    description: 'Chat',
    alwaysShow: true,
}

const CHAT_ITEM_NO_PREFIX: vscode.QuickPickItem = {
    label: '$(comment) Chat',
    alwaysShow: true,
}

const CHAT_ITEM_HYBRID: vscode.QuickPickItem = {
    label: '$(comment) Chat',
    description: '(?)',
    alwaysShow: true,
}

const EDIT_ITEM_PREFIX: vscode.QuickPickItem = {
    label: ':',
    description: 'Edit',
    alwaysShow: true,
}

const EDIT_ITEM_NO_PREFIX: vscode.QuickPickItem = {
    label: '$(edit) Edit',
    alwaysShow: true,
}

const EDIT_ITEM_HYBRID: vscode.QuickPickItem = {
    label: '$(edit) Edit',
    description: '(:)',
    alwaysShow: true,
}

const SEARCH_ITEM_PREFIX: vscode.QuickPickItem = {
    label: '%',
    description: 'Search',
    alwaysShow: true,
}

const SEARCH_ITEM_NO_PREFIX: vscode.QuickPickItem = {
    label: '$(search) Search',
    alwaysShow: true,
}

const SEARCH_ITEM_HYBRID: vscode.QuickPickItem = {
    label: '$(search) Search',
    description: '(%)',
    alwaysShow: true,
}

/** Temporary type for prototyping the input using a prefix design vs no-prefix */
export type InputType = 'WithPrefix' | 'NoPrefix' | 'Hybrid'
export const DEFAULT_INPUT_TYPE: InputType = 'WithPrefix'

export const INPUT_TITLE = `Cody${!isRunningInsideAgent() ? ' (⌥C)' : ''}`

const INPUT_SETTINGS_CTA: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('gear'),
    tooltip: 'Configure Cody settings...',
}

const getInputItems = (type: InputType): GetItemsResult => {
    if (type === 'WithPrefix') {
        return {
            items: [CHAT_ITEM_PREFIX, EDIT_ITEM_PREFIX, SEARCH_ITEM_PREFIX],
        }
    }

    if (type === 'Hybrid') {
        return {
            items: [CHAT_ITEM_HYBRID, EDIT_ITEM_HYBRID, SEARCH_ITEM_HYBRID],
        }
    }

    return {
        items: [CHAT_ITEM_NO_PREFIX, EDIT_ITEM_NO_PREFIX, SEARCH_ITEM_NO_PREFIX],
    }
}

interface GetInputParams {
    document: vscode.TextDocument
    source: ChatEventSource
    editManager: EditManager
    chatManager: ChatManager
    type?: InputType
}

export const getInput = async ({
    document,
    chatManager,
    editManager,
    source,
    type = DEFAULT_INPUT_TYPE,
}: GetInputParams): Promise<null> => {
    const editor = getEditor().active
    if (!editor) {
        // No active editor, no editor input
        return null
    }

    return new Promise(resolve => {
        const codyInput = createQuickPick({
            title: INPUT_TITLE,
            placeHolder: type === 'WithPrefix' ? 'Type or choose a command' : 'Choose a command',
            getItems: () => getInputItems(type),
            buttons: [INPUT_SETTINGS_CTA],
            onDidTriggerButton: target => {
                if (target === INPUT_SETTINGS_CTA) {
                    void vscode.commands.executeCommand('workbench.action.openSettings', {
                        query: '@ext:sourcegraph.cody-ai Edit',
                    })
                }
            },
            onDidChangeValue:
                type === 'WithPrefix' || type === 'Hybrid'
                    ? async (value: string) => {
                          if (value.startsWith('?')) {
                              return chatManager.executeChatInline(type)
                          }

                          if (value.startsWith(':')) {
                              return editManager.executeEdit({
                                  configuration: { document, inputType: type },
                                  source,
                              })
                          }

                          if (value.startsWith('%')) {
                              return showSearchInput(type)
                          }

                          return
                      }
                    : undefined,
            onDidAccept: async () => {
                const { input } = codyInput
                const selectedItem = input.selectedItems[0]

                switch (selectedItem.label) {
                    case EDIT_ITEM_PREFIX.label:
                    case EDIT_ITEM_NO_PREFIX.label:
                    case EDIT_ITEM_HYBRID.label:
                        return executeEdit({ configuration: { document, inputType: type }, source })
                    case CHAT_ITEM_PREFIX.label:
                    case CHAT_ITEM_NO_PREFIX.label:
                    case CHAT_ITEM_HYBRID.label:
                        return chatManager.executeChatInline(type)
                    case SEARCH_ITEM_PREFIX.label:
                    case SEARCH_ITEM_NO_PREFIX.label:
                    case SEARCH_ITEM_HYBRID.label:
                        return showSearchInput(type)
                }

                return
            },
        })

        // TODO: Render with initial input value
        codyInput.render('')
        codyInput.input.activeItems = []
    })
}

export const registerEditorInput = (
    authProvider: AuthProvider,
    editManager: EditManager,
    chatManager: ChatManager
): vscode.Disposable => {
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

            const source = params.source || 'editor'

            getInput({ document, source, editManager, chatManager })
        }
    )
}
