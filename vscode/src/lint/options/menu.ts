import { type ChatModel, type EventSource, ModelUsage, ModelsService } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import type { URI } from 'vscode-uri'
import { ACCOUNT_UPGRADE_URL } from '../../chat/protocol'
import { getModelInputItems, getModelOptionItems } from '../../edit/input/get-items/model'
import type { ModelItem } from '../../edit/input/get-items/types'
import { createQuickPick } from '../../edit/input/quick-pick'
import type { VSCodeEditor } from '../../editor/vscode-editor'
import type { AuthProvider } from '../../services/AuthProvider'
import {
    FILES_ITEM,
    MODEL_ITEM,
    ONBOARDING_RULES_ITEM,
    type QuickPickFileItem,
    RULES_ITEM,
    getFileInputItems,
    getLintInputItems,
    getRuleInputItems,
} from './items'

export type CommitHash = string

export interface LintInput {
    /** Any user provided set of lint files */
    lintFiles: URI[]
    /** The target files */
    targetFiles: URI[]
    targetCommitHash?: CommitHash
    /** The LLM that the user has selected */
    model: ChatModel
}

interface InitialValues {
    initialLintFiles: URI[]
    /** Either Files or a CommitHash */
    initialTarget: URI[] | CommitHash
    initialModel: ChatModel
}

export const getInput = async (
    editor: VSCodeEditor,
    authProvider: AuthProvider,
    initialValues: InitialValues,
    source: EventSource
): Promise<LintInput | null> => {
    const authStatus = authProvider.getAuthStatus()
    const isCodyPro = !authStatus.userCanUpgrade
    const modelOptions = ModelsService.getModels(ModelUsage.Chat)
    const modelItems = getModelOptionItems(modelOptions, isCodyPro)
    const showModelSelector = modelOptions.length > 1 && authStatus.isDotCom

    let activeModel = initialValues.initialModel
    let activeModelItem = modelItems.find(item => item.model === initialValues.initialModel)
    let activeTargetFiles =
        typeof initialValues.initialTarget === 'string' ? [] : initialValues.initialTarget
    // biome-ignore lint/style/useConst: <explanation>
    let activeTargetGitHash =
        typeof initialValues.initialTarget === 'string' ? initialValues.initialTarget : null
    let activeLintFiles = initialValues.initialLintFiles

    // ContextItems to store possible user-provided context
    // const contextItems = new Map<string, ContextItem>()
    // const selectedContextItems = new Map<string, ContextItem>()

    // Initialize the selectedContextItems with any previous items
    // // This is primarily for edit retries, where a user may want to reuse their context
    // for (const file of initialValues.initialSelectedContextItems ?? []) {
    //     selectedContextItems.set(getLabelForContextItem(file), file)
    // }

    const lintFilesPromise = new Promise<URI[]>(resolve =>
        vscode.workspace.findFiles('**/*.codylint.yaml').then(
            files => {
                resolve(files)
            },
            () => {
                resolve([] as URI[])
            }
        )
    )
    const commitPromises = Promise.resolve([])

    return new Promise(resolve => {
        const modelInput = createQuickPick({
            title: 'Cody Lint',
            placeHolder: 'Select a model',
            getItems: () => getModelInputItems(modelOptions, activeModel, isCodyPro),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: () => lintInput.render(lintInput.input.value),
            onDidHide: () => {
                lintInput.render(lintInput.input.value)
            },
            onDidAccept: async item => {
                const acceptedItem = item as ModelItem<ChatModel>
                if (!acceptedItem) {
                    return
                }
                telemetryRecorder.recordEvent('cody.lint.input.model', 'selected')

                if (acceptedItem.codyProOnly && !isCodyPro) {
                    const option = await vscode.window.showInformationMessage(
                        'Upgrade to Cody Pro',
                        {
                            modal: true,
                            detail: `Upgrade to Cody Pro to use ${acceptedItem.modelTitle} for Linting`,
                        },
                        'Upgrade',
                        'See Plans'
                    )

                    // Both options go to the same URL
                    if (option) {
                        void vscode.env.openExternal(vscode.Uri.parse(ACCOUNT_UPGRADE_URL.toString()))
                    }

                    return
                }

                ModelsService.setSelectedModel(ModelUsage.Edit, acceptedItem.model)
                activeModelItem = acceptedItem
                activeModel = acceptedItem.model

                lintInput.render(lintInput.input.value)
            },
        })

        const targetFilesInput = createQuickPick<QuickPickFileItem>({
            title: 'Select Files',
            placeHolder: 'Select files',
            canSelectMany: true,
            getItems: () => getFileInputItems(activeTargetFiles),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: button => {
                lintInput.render(lintInput.input.value)
            },
            onDidHide: () => {
                lintInput.render(lintInput.input.value)
            },
            onDidAccept: items => {
                activeTargetFiles = items.map(item => item.file)
                lintInput.render(lintInput.input.value)
            },
        })

        let rulesInputEarlyExit = false // this is used to ensure we don't un-hide if we've exited the flow early
        const rulesInput = createQuickPick<QuickPickFileItem | typeof ONBOARDING_RULES_ITEM>({
            title: 'Select Rules',
            placeHolder: 'Select lint rules',
            canSelectMany: true,
            getItems: async () => {
                const [items, hasRules] = await getRuleInputItems(activeLintFiles, lintFilesPromise)
                //TODO: This is a bit hacky, we dynamically swith between
                //multi/single select depending on if we want ot onboard the
                //user. This all needs a makeover.
                rulesInput.input.canSelectMany = hasRules
                return items
            },
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: () => lintInput.render(lintInput.input.value),
            onDidHide: () => {
                if (!rulesInputEarlyExit) {
                    lintInput.render(lintInput.input.value)
                }
            },
            onDidAccept: item => {
                const onboardingAction = item.find(i => i.label === ONBOARDING_RULES_ITEM.label)
                if (onboardingAction) {
                    //TODO: handle error
                    const rootUri = editor.getWorkspaceRootUri()!
                    const fileUri = vscode.Uri.joinPath(rootUri, 'example.codylint.yaml')
                    editor.createWorkspaceFile(atob(ONBOARDING_LINT_TEMPLATE), fileUri).finally(() => {
                        rulesInputEarlyExit = true
                        rulesInput.input.hide()
                        resolve(null)
                    })
                } else {
                    activeLintFiles = (item as QuickPickFileItem[]).map(i => i.file)
                    lintInput.render(lintInput.input.value)
                }
            },
        })

        const lintInput = createQuickPick({
            title: 'Cody Lint',
            placeHolder: 'Select ',
            getItems: () =>
                getLintInputItems(
                    activeTargetFiles.length,
                    activeLintFiles.length,
                    activeModelItem,
                    showModelSelector
                ),
            ...(source === 'menu'
                ? {
                      buttons: [vscode.QuickInputButtons.Back],
                      onDidTriggerButton: target => {
                          if (target === vscode.QuickInputButtons.Back) {
                              void vscode.commands.executeCommand('cody.menu.commands')
                              lintInput.input.hide()
                          }
                      },
                  }
                : {}),
            onDidAccept: () => {
                const input = lintInput.input
                // Selected item flow, update the input and store it for submission
                const selectedItem = input.selectedItems[0]
                switch (selectedItem.label) {
                    case MODEL_ITEM.label:
                        modelInput.render('')
                        return
                    case FILES_ITEM.label:
                        targetFilesInput.render('')
                        return
                    case RULES_ITEM.label:
                        rulesInput.render('')
                        return
                }

                input.hide()
                return resolve({
                    lintFiles: activeLintFiles,
                    targetFiles: activeTargetFiles,
                    model: activeModel,
                })
            },
        })

        const initialInput = '' //initialValues.initialInputValue?.toString() || ''
        lintInput.render(initialInput)

        // if (initialInput.length === 0) {
        //     // If we have no initial input, we want to ensure we don't auto-select anything
        //     // This helps ensure the input does not feel like a menu.
        //     lintInput.input.activeItems = []
        // }
    })
}

// const rangeSymbolsInput = createQuickPick({
//     title: activeTitle,
//     placeHolder: 'Select a symbol',
//     getItems: () =>
//         getRangeSymbolInputItems({ ...initialValues, initialCursorPosition }, symbolsPromise),
//     buttons: [vscode.QuickInputButtons.Back],
//     onDidTriggerButton: () => lintInput.render(lintInput.input.value),
//     onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
//     onDidChangeActive: async items => {
//         const item = items[0] as EditRangeItem
//         if (item) {
//             const range = item.range instanceof vscode.Range ? item.range : await item.range()
//             previewActiveRange(range)
//         }
//     },
//     onDidAccept: async item => {
//         const acceptedItem = item as EditRangeItem
//         if (!acceptedItem) {
//             return
//         }
//         telemetryRecorder.recordEvent('cody.fixup.input.rangeSymbol', 'selected')

//         activeRangeItem = acceptedItem
//         const range =
//             acceptedItem.range instanceof vscode.Range
//                 ? acceptedItem.range
//                 : await acceptedItem.range()

//         updateActiveRange(range)
//         lintInput.render(lintInput.input.value)
//     },
// })

// const rangeInput = createQuickPick({
//     title: activeTitle,
//     placeHolder: 'Select a range to edit',
//     getItems: () =>
//         getRangeInputItems(
//             document,
//             { ...initialValues, initialCursorPosition },
//             activeRange,
//             activeModelContextWindow
//         ),
//     buttons: [vscode.QuickInputButtons.Back],
//     onDidTriggerButton: () => lintInput.render(lintInput.input.value),
//     onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
//     onDidChangeActive: async items => {
//         const item = items[0] as EditRangeItem
//         if (item) {
//             const range = item.range instanceof vscode.Range ? item.range : await item.range()
//             previewActiveRange(range)
//         }
//     },
//     onDidAccept: async item => {
//         const acceptedItem = item as EditRangeItem
//         if (!acceptedItem) {
//             return
//         }

//         if (acceptedItem.label === RANGE_SYMBOLS_ITEM.label) {
//             rangeSymbolsInput.render('')
//             return
//         }

//         telemetryRecorder.recordEvent('cody.fixup.input.range', 'selected')

//         activeRangeItem = acceptedItem
//         const range =
//             acceptedItem.range instanceof vscode.Range
//                 ? acceptedItem.range
//                 : await acceptedItem.range()

//         updateActiveRange(range)
//         lintInput.render(lintInput.input.value)
//     },
// })

// NOTE: this is base64 encoded because of some special character issues. Really this should be loaded from file.
const ONBOARDING_LINT_TEMPLATE =
    'IwojICAgLGFkODg4OGJhLCAgICAgICAgICAgICAgICAgICAgICAgICA4OCAgICAgICAgICAgICAgICAgIDg4ICAgICAgICAgICA4OAojICBkOCInICAgIGAiOGIgICAgICAgICAgICAgICAgICAgICAgICA4OCAgICAgICAgICAgICAgICAgIDg4ICAgICAgICAgICAiIiAgICAgICAgICAgICAgICAsZAojIGQ4JyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICA4OCAgICAgICAgICAgICAgICAgIDg4ICAgICAgICAgICAgICAgICAgICAgICAgICAgICA4OAojIDg4ICAgICAgICAgICAgICAsYWRQUFliYSwgICAgLGFkUFBZYiw4OCAgOGIgICAgICAgZDggICAgIDg4ICAgICAgICAgICA4OCAgOGIsZFBQWWJhLCAgTU04OE1NTQojIDg4ICAgICAgICAgICAgIGE4IiAgICAgIjhhICBhOCIgICAgYFk4OCAgYDhiICAgICBkOCcgICAgIDg4ICAgICAgICAgICA4OCAgODhQJyAgIGAiOGEgICA4OAojIFk4LCAgICAgICAgICAgIDhiICAgICAgIGQ4ICA4YiAgICAgICA4OCAgIGA4YiAgIGQ4JyAgICAgIDg4ICAgICAgICAgICA4OCAgODggICAgICAgODggICA4OAojICBZOGEuICAgIC5hOFAgICI4YSwgICAsYTgiICAiOGEsICAgLGQ4OCAgICBgOGIsZDgnICAgICAgIDg4ICAgICAgICAgICA4OCAgODggICAgICAgODggICA4OCwKIyAgIGAiWTg4ODhZIicgICAgYCJZYmJkUCInICAgIGAiOGJiZFAiWTggICAgICBZODgnICAgICAgICA4ODg4ODg4ODg4OCAgODggIDg4ICAgICAgIDg4ICAgIlk4ODgKIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICBkOCcKIyAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgIGQ4JyAgICAgICAgICBeXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eCiMgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgICAgXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXl5eXgpydWxlczoKICAjIEEgZ29vZCB0aXRsZSBoZWxwcyB0aGUgdXNlciB1bmRlcnN0YW5kIHRoZSBwcm9ibGVtIGluIGEgZmV3IHdvcmRzLgotIHRpdGxlOiAiZGVjbGFyZSB3aGVyZSB1c2VkIgogIGRlc2NyaXB0aW9uOgogICAgaHVtYW46ID4KICAgICAgVmFyaWFibGVzIHNob3VsZCBiZSBkZWNsYXJlZCBjbG9zZSB0byB3aGVyZSB0aGV5IGFyZSB1c2VkCiAgICBjb2R5OiA+CiAgICAgIFZhcmlhYmxlIGRlY2xlcmF0aW9ucyBzaG91bGQgYmUgYXMgY2xvc2UgdG8gdGhlaXIgZmlyc3QgdXNlIGFzIHBvc3NpYmxlIHdpdGhpbiBhIGZ1bmN0aW9uIGJvZHkuCiAgICAgIEhvd2V2ZXIgaXQgbmVlZHMgdG8gYmUgYmFsYW5jZWQgd2l0aCB0aGUgZGVzaXJlIHRvIGtlZXAgcmVsYXRlZCB2YXJpYWJsZXMgZ3JvdXBlZCBhbmQgdGhlIGNvZGUgcmVhZGFibGUuCiAgICAgIE9ubHkgcG9pbnQgb3V0IHRoZSB3b3JzdCBvZmZlbmRlcnMuIEFsc28gZm9sbG93IHRoZSBndWlkZXMgaW4gQG5vdGlvbmd1aWRlCiAgIyAoT3B0aW9uYWwpOiBBbGxvd3MgeW91IHRvIGRlZmluZSBhIGxpbmsgd2hlcmUgdGhlIHVzZXIgY2FuIGZpbmQgbW9yZSBpbmZvcm1hdGlvbiBhYm91dCB0aGUgcnVsZQogIHJlYWRNb3JlOiAiaHR0cHM6Ly9nb29nbGUuY29tIgogICMgVGhlc2UgYXJlIGFkZGl0aW9uYWwgaW5zdHJ1Y3Rpb25zIGZvciBDb2R5IHdoZW4gdGhlIHVzZXIgYXNrcyBDb2R5IHRvIGZpeAogICMgdGhlIHByb2JsZW0uIFRoaXMgY291bGQgZm9yIGluc3RhbmNlIHBvaW50IG91dCBpbXBvcnRhbnQgZGV0YWlscyBhYm91dCB3aGF0CiAgIyBtYWtlcyBhIGdvb2Qgc29sdXRpb24uCiAgcXVpY2tGaXg6ID4KICAgIEluc3RlYWQgb2YgbW92aW5nIHRoZSB2YXJpYWJsZSBtYWtlIHN1cmUgdG8gaW5zZXJ0IGEgY29tbWVudCB3aXRoIHRoZSB2YXJpYWJsZSBuYW1lIGluIGEgcHJvcG9zZWQgYmV0dGVyIGxvY2F0aW9uLgogICAgTWFrZSBhdCBtb3N0IDMgcHJvcG9zYWxzLgogIGNvbnRleHQ6CiAgICBub3Rpb25ndWlkZTogIltAb3BlbmN0eDpub3Rpb25dKGh0dHBzOi8vc291cmNlZ3JhcGgubm90aW9uLmNvbS9ibGFoL2JsYWgvYmxhaCkiCg=='
