import type { ChatEventSource, ContextItem, EditModel } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { ACCOUNT_UPGRADE_URL } from '../../chat/protocol'
import { commands as defaultCommands } from '../../commands/execute/cody.json'
import { getEditor } from '../../editor/active-editor'
import { editModel } from '../../models'
import { type TextChange, updateRangeMultipleChanges } from '../../non-stop/tracked-range'
import type { AuthProvider } from '../../services/AuthProvider'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { executeEdit } from '../execute'
import type { EditIntent } from '../types'
import { isGenerateIntent } from '../utils/edit-intent'
import { getEditModelsForUser } from '../utils/edit-models'
import { FILE_HELP_LABEL, NO_MATCHES_LABEL, SYMBOL_HELP_LABEL } from './constants'
import { CURSOR_RANGE_ITEM, EXPANDED_RANGE_ITEM, SELECTION_RANGE_ITEM } from './get-items/constants'
import { getDocumentInputItems } from './get-items/document'
import { DOCUMENT_ITEM, MODEL_ITEM, RANGE_ITEM, TEST_ITEM, getEditInputItems } from './get-items/edit'
import { getModelInputItems, getModelOptionItems } from './get-items/model'
import { getRangeInputItems } from './get-items/range'
import { getTestInputItems } from './get-items/test'
import type { EditModelItem, EditRangeItem } from './get-items/types'
import { getMatchingContext } from './get-matching-context'
import { createQuickPick } from './quick-pick'
import { fetchDocumentSymbols, getLabelForContextItem, getTitleRange, removeAfterLastAt } from './utils'

interface QuickPickInput {
    /** The user provided instruction */
    instruction: string
    /** Any user provided context, from @ or @# */
    userContextFiles: ContextItem[]
    /** The LLM that the user has selected */
    model: EditModel
    /** The range that the user has selected */
    range: vscode.Range
    /**
     * The derived intent from the users instructions
     * This will effectively only change if the user switching from a "selection" to a "cursor"
     * position, or vice-versa.
     */
    intent: EditIntent
}

export interface EditInputInitialValues {
    initialRange: vscode.Range
    initialExpandedRange?: vscode.Range
    initialModel: EditModel
    initialIntent: EditIntent
    initialInputValue?: string
    initialSelectedContextFiles?: ContextItem[]
}

const PREVIEW_RANGE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightTextBackground'),
    borderColor: new vscode.ThemeColor('editor.wordHighlightTextBorder'),
    borderWidth: '3px',
    borderStyle: 'solid',
})

export const getInput = async (
    document: vscode.TextDocument,
    authProvider: AuthProvider,
    initialValues: EditInputInitialValues,
    source: ChatEventSource
): Promise<QuickPickInput | null> => {
    const editor = getEditor().active
    if (!editor) {
        return null
    }

    const initialCursorPosition = editor.selection.active
    let activeRange = initialValues.initialExpandedRange || initialValues.initialRange
    let activeRangeItem =
        initialValues.initialIntent === 'add'
            ? CURSOR_RANGE_ITEM
            : initialValues.initialExpandedRange
              ? EXPANDED_RANGE_ITEM
              : SELECTION_RANGE_ITEM

    const authStatus = authProvider.getAuthStatus()
    const isCodyPro = !authStatus.userCanUpgrade
    const modelOptions = getEditModelsForUser(authStatus)
    const modelItems = getModelOptionItems(modelOptions, isCodyPro)
    const showModelSelector = modelOptions.length > 1 && authStatus.isDotCom

    let activeModel = initialValues.initialModel
    let activeModelItem = modelItems.find(item => item.model === initialValues.initialModel)

    // ContextItems to store possible user-provided context
    const contextItems = new Map<string, ContextItem>()
    const selectedContextItems = new Map<string, ContextItem>()

    // Initialize the selectedContextItems with any previous items
    // This is primarily for edit retries, where a user may want to reuse their context
    for (const file of initialValues.initialSelectedContextFiles ?? []) {
        selectedContextItems.set(getLabelForContextItem(file), file)
    }

    /**
     * Set the title of the quick pick to include the file and range
     * Update the title as the range changes
     */
    const relativeFilePath = vscode.workspace.asRelativePath(document.uri.fsPath)
    let activeTitle: string
    const updateActiveTitle = (newRange: vscode.Range) => {
        const fileRange = getTitleRange(newRange)
        activeTitle = `Edit ${relativeFilePath}:${fileRange} with Cody`
    }
    updateActiveTitle(activeRange)

    /**
     * Listens for text document changes and updates the range when changes occur.
     * This allows the range to stay in sync if the user continues editing after
     * requesting the refactoring.
     */
    const registerRangeListener = () => {
        return vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document !== document) {
                return
            }

            const changes = new Array<TextChange>(...event.contentChanges)
            const updatedRange = updateRangeMultipleChanges(activeRange, changes)
            if (!updatedRange.isEqual(activeRange)) {
                activeRange = updatedRange
                updateActiveTitle(activeRange)
            }
        })
    }
    let textDocumentListener = registerRangeListener()
    const updateActiveRange = (range: vscode.Range) => {
        // Clear any set decorations
        editor.setDecorations(PREVIEW_RANGE_DECORATION, [])

        // Pause listening to range changes to avoid a possible race condition
        textDocumentListener.dispose()

        editor.selection = new vscode.Selection(range.start, range.end)
        activeRange = range

        // Resume listening to range changes
        textDocumentListener = registerRangeListener()
        // Update the title to reflect the new range
        updateActiveTitle(activeRange)
    }
    const previewActiveRange = (range: vscode.Range) => {
        editor.setDecorations(PREVIEW_RANGE_DECORATION, [range])
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    }
    previewActiveRange(activeRange)

    // Start fetching symbols early, so they can be used immediately if an option is selected
    const symbolsPromise = fetchDocumentSymbols(document)

    return new Promise(resolve => {
        const modelInput = createQuickPick({
            title: activeTitle,
            placeHolder: 'Select a model',
            getItems: () => getModelInputItems(modelOptions, activeModel, isCodyPro),
            buttons: [vscode.QuickInputButtons.Back],
            onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
            onDidTriggerButton: () => editInput.render(activeTitle, editInput.input.value),
            onDidAccept: async item => {
                const acceptedItem = item as EditModelItem
                if (!acceptedItem) {
                    return
                }
                telemetryRecorder.recordEvent('cody.fixup.input.model', 'selected')

                if (acceptedItem.codyProOnly && !isCodyPro) {
                    // Temporarily ignore focus out, so that the user can return to the quick pick if desired.
                    modelInput.input.ignoreFocusOut = true

                    const option = await vscode.window.showInformationMessage(
                        'Upgrade to Cody Pro',
                        {
                            modal: true,
                            detail: `Upgrade to Cody Pro to use ${acceptedItem.modelTitle} for Edit`,
                        },
                        'Upgrade',
                        'See Plans'
                    )

                    // Both options go to the same URL
                    if (option) {
                        void vscode.env.openExternal(vscode.Uri.parse(ACCOUNT_UPGRADE_URL.toString()))
                    }

                    // Restore the default focus behaviour
                    modelInput.input.ignoreFocusOut = false
                    return
                }

                editModel.set(acceptedItem.model)
                activeModelItem = acceptedItem
                activeModel = acceptedItem.model

                editInput.render(activeTitle, editInput.input.value)
            },
        })

        const rangeInput = createQuickPick({
            title: activeTitle,
            placeHolder: 'Select a range to edit',
            getItems: () =>
                getRangeInputItems(
                    document,
                    { ...initialValues, initialCursorPosition },
                    activeRange,
                    symbolsPromise
                ),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: () => editInput.render(activeTitle, editInput.input.value),
            onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
            onDidChangeActive: async items => {
                const item = items[0] as EditRangeItem
                if (item) {
                    const range = item.range instanceof vscode.Range ? item.range : await item.range()
                    previewActiveRange(range)
                }
            },
            onDidAccept: async item => {
                const acceptedItem = item as EditRangeItem
                if (!acceptedItem) {
                    return
                }
                telemetryRecorder.recordEvent('cody.fixup.input.range', 'selected')

                activeRangeItem = acceptedItem
                const range =
                    acceptedItem.range instanceof vscode.Range
                        ? acceptedItem.range
                        : await acceptedItem.range()

                updateActiveRange(range)
                editInput.render(activeTitle, editInput.input.value)
            },
        })

        const documentInput = createQuickPick({
            title: activeTitle,
            placeHolder: 'Select a symbol to document',
            getItems: () => getDocumentInputItems(document, initialValues, activeRange, symbolsPromise),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: () => editInput.render(activeTitle, editInput.input.value),
            onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
            onDidChangeActive: async items => {
                const item = items[0] as EditRangeItem
                if (item) {
                    const range = item.range instanceof vscode.Range ? item.range : await item.range()
                    previewActiveRange(range)
                }
            },
            onDidAccept: async item => {
                const acceptedItem = item as EditRangeItem
                if (!acceptedItem) {
                    return
                }

                const range =
                    acceptedItem.range instanceof vscode.Range
                        ? acceptedItem.range
                        : await acceptedItem.range()

                // Expand the range from the node to include the full lines
                const fullDocumentableRange = new vscode.Range(
                    document.lineAt(range.start.line).range.start,
                    document.lineAt(range.end.line).range.end
                )
                updateActiveRange(fullDocumentableRange)

                // Hide the input and execute a new edit for 'Document'
                documentInput.input.hide()
                return executeEdit({
                    configuration: {
                        document,
                        instruction: defaultCommands.doc.prompt,
                        range: activeRange,
                        intent: 'doc',
                        mode: 'insert',
                        contextMessages: [],
                        userContextFiles: [],
                    },
                    source: 'menu',
                })
            },
        })

        const unitTestInput = createQuickPick({
            title: activeTitle,
            placeHolder: 'Select a symbol to generate tests',
            getItems: () =>
                getTestInputItems(editor.document, initialValues, activeRange, symbolsPromise),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: () => editInput.render(activeTitle, editInput.input.value),
            onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
            onDidChangeActive: async items => {
                const item = items[0] as EditRangeItem
                if (item) {
                    const range = item.range instanceof vscode.Range ? item.range : await item.range()
                    previewActiveRange(range)
                }
            },
            onDidAccept: async item => {
                const acceptedItem = item as EditRangeItem
                if (!acceptedItem) {
                    return
                }

                const range =
                    acceptedItem.range instanceof vscode.Range
                        ? acceptedItem.range
                        : await acceptedItem.range()
                updateActiveRange(range)

                // Hide the input and execute a new edit for 'Test'
                unitTestInput.input.hide()

                // TODO: This should entirely run through `executeEdit` when
                // the unit test command has fully moved over to Edit.
                return vscode.commands.executeCommand('cody.command.unit-tests')
            },
        })

        const editInput = createQuickPick({
            title: activeTitle,
            placeHolder: 'Enter edit instructions (type @ to include code, ⏎ to submit)',
            getItems: () =>
                getEditInputItems(
                    editInput.input.value,
                    activeRangeItem,
                    activeModelItem,
                    showModelSelector
                ),
            onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
            ...(source === 'menu'
                ? {
                      buttons: [vscode.QuickInputButtons.Back],
                      onDidTriggerButton: target => {
                          if (target === vscode.QuickInputButtons.Back) {
                              void vscode.commands.executeCommand('cody.menu.commands')
                              editInput.input.hide()
                          }
                      },
                  }
                : {}),
            onDidChangeValue: async value => {
                const input = editInput.input
                if (
                    initialValues.initialInputValue !== undefined &&
                    value === initialValues.initialInputValue
                ) {
                    // Noop, this event is fired when an initial value is set
                    return
                }

                const isFileSearch = value.endsWith('@')
                const isSymbolSearch = value.endsWith('@#')

                // If we have the beginning of a file or symbol match, show a helpful label
                if (isFileSearch) {
                    input.items = [{ alwaysShow: true, label: FILE_HELP_LABEL }]
                    return
                }
                if (isSymbolSearch) {
                    input.items = [{ alwaysShow: true, label: SYMBOL_HELP_LABEL }]
                    return
                }

                const matchingContext = await getMatchingContext(value)
                if (matchingContext === null) {
                    // Nothing to match, re-render existing items
                    // eslint-disable-next-line no-self-assign
                    input.items = getEditInputItems(
                        input.value,
                        activeRangeItem,
                        activeModelItem,
                        showModelSelector
                    ).items
                    return
                }

                if (matchingContext.length === 0) {
                    // Attempted to match but found nothing
                    input.items = [{ alwaysShow: true, label: NO_MATCHES_LABEL }]
                    return
                }

                // Update stored context items so we can retrieve them later
                for (const { key, file } of matchingContext) {
                    contextItems.set(key, file)
                }

                // Add human-friendly labels to the quick pick so the user can select them
                input.items = matchingContext.map(({ key, shortLabel }) => ({
                    alwaysShow: true,
                    label: shortLabel || key,
                    description: shortLabel ? key : undefined,
                }))
            },
            onDidAccept: () => {
                const input = editInput.input
                const instruction = input.value.trim()

                // Selected item flow, update the input and store it for submission
                const selectedItem = input.selectedItems[0]
                switch (selectedItem.label) {
                    case MODEL_ITEM.label:
                        modelInput.render(activeTitle, '')
                        return
                    case RANGE_ITEM.label:
                        rangeInput.render(activeTitle, '')
                        return
                    case DOCUMENT_ITEM.label:
                        documentInput.render(activeTitle, '')
                        return
                    case TEST_ITEM.label:
                        unitTestInput.render(activeTitle, '')
                        return
                }

                // Empty input flow, do nothing
                if (!instruction) {
                    return
                }

                // User provided context flow, the `key` is provided as the `description` for symbol items, use this if available.
                const key = selectedItem?.description || selectedItem?.label
                if (selectedItem) {
                    const contextItem = contextItems.get(key)
                    if (contextItem) {
                        // Replace fuzzy value with actual context in input
                        input.value = `${removeAfterLastAt(instruction)}@${key} `
                        selectedContextItems.set(key, contextItem)
                        return
                    }
                }

                // Submission flow, validate selected items and return final output
                input.hide()
                textDocumentListener.dispose()
                return resolve({
                    instruction: instruction.trim(),
                    userContextFiles: Array.from(selectedContextItems)
                        .filter(([key]) => instruction.includes(`@${key}`))
                        .map(([, value]) => value),
                    model: activeModel,
                    range: activeRange,
                    intent: isGenerateIntent(document, activeRange) ? 'add' : 'edit',
                })
            },
        })

        editInput.render(activeTitle, initialValues.initialInputValue || '')
        editInput.input.activeItems = []
    })
}
