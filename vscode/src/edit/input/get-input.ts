import * as vscode from 'vscode'
import type { EditSupportedModels } from '../prompt'
import type { ChatEventSource, ContextFile } from '@sourcegraph/cody-shared'
import type { ExecuteEditArguments } from '../execute'
import { getEditor } from '../../editor/active-editor'
import { getLabelForContextFile, getTitleRange, removeAfterLastAt } from './utils'
import { type TextChange, updateRangeMultipleChanges } from '../../non-stop/tracked-range'
import { getEditSmartSelection } from '../utils/edit-selection'
import { createQuickPick } from './quick-pick'
import { FILE_HELP_LABEL, NO_MATCHES_LABEL, SYMBOL_HELP_LABEL } from './constants'
import { getMatchingContext } from './get-matching-context'
import {
    MODEL_ITEM,
    RANGE_ITEM,
    getEditInputItems,
    getModelInputItems,
    getRangeInputItems,
    RANGE_ITEMS
} from './get-items'
import type { EditRangeSource } from '../types'

interface QuickPickInput {
    /** The user provided instruction */
    instruction: string
    /** Any user provided context, from @ or @# */
    userContextFiles: ContextFile[]
    /** The LLM that the user has selected, if selected */
    model?: EditSupportedModels
    /** The range that the user has selected */
    range: vscode.Range
    /** The source of the range selection */
    rangeSource: EditRangeSource
}

export interface EditInputParams extends ExecuteEditArguments {
    initialValue?: string
    initialSelectedContextFiles?: ContextFile[]
}

export const getInput = async (
    params: EditInputParams,
    source: ChatEventSource
): Promise<QuickPickInput | null> => {
    const label = 'get input'
    performance.mark(label)
    const editor = getEditor().active
    if (!editor) {
        return null
    }
    const document = params.document || editor.document
    const initialRange = params.range || editor.selection
    if (!document || !initialRange) {
        return null
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
    updateActiveTitle(initialRange)

    /**
     * Listens for text document changes and updates the range when changes occur.
     * This allows the range to stay in sync if the user continues editing after
     * requesting the refactoring.
     */
    let activeRange = initialRange
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
    const updateActiveRange = (newRange: vscode.Range) => {
        // Pause listening to range changes to avoid a possible race condition
        textDocumentListener.dispose()
        activeRange = newRange
        // Resume listening to range changes
        textDocumentListener = registerRangeListener()
        // Update the title to reflect the new range
        updateActiveTitle(activeRange)
    }

    // ContextItems to store possible context
    const contextItems = new Map<string, ContextFile>()
    const selectedContextItems = new Map<string, ContextFile>()

    // Initialize the selectedContextItems with any previous items
    // This is primarily for edit retries, where a user may want to reuse their context
    for (const file of params.initialSelectedContextFiles ?? []) {
        selectedContextItems.set(getLabelForContextFile(file), file)
    }

    let activeModel: EditSupportedModels = 'anthropic/claude-2.1'
    let activeRangeSource: EditRangeSource = 'selection'

    return new Promise(resolve => {
        const modelInput = createQuickPick({
            title: activeTitle,
            placeHolder: 'Change Model',
            getItems: () => getModelInputItems(params, activeModel),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: target => {
                if (target === vscode.QuickInputButtons.Back) {
                    editInput.render(activeTitle, editInput.input.value)
                }
            },
            onDidChangeActive: items => {
                const item = items[0]

                if (item.label === '$(anthropic-logo) Claude 2.1') {
                    activeModel = 'anthropic/claude-2.1'
                    return
                }

                if (item.label === '$(anthropic-logo) Claude Instant') {
                    activeModel = 'anthropic/claude-instant-1.2'
                    return
                }
            },
            onDidAccept: () => editInput.render(activeTitle, editInput.input.value),
        })

        const rangeInput = createQuickPick({
            title: activeTitle,
            placeHolder: 'Change Range',
            getItems: () => getRangeInputItems(params, activeRangeSource),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: target => {
                if (target === vscode.QuickInputButtons.Back) {
                    editInput.render(activeTitle, editInput.input.value)
                }
            },
            onDidChangeActive: async items => {
                const item = items[0]
                if (!editor) {
                    return
                }

                if (item.label === RANGE_ITEMS.selection.label) {
                    editor.selection = new vscode.Selection(initialRange.start, initialRange.end)
                    updateActiveRange(editor.selection)
                    activeRangeSource = 'selection'
                    return
                }

                if (item.label === RANGE_ITEMS.expanded.label) {
                    const smartSelection = await getEditSmartSelection(editor.document, initialRange, {
                        ignoreSelection: true,
                    })
                    editor.selection = new vscode.Selection(smartSelection.start, smartSelection.end)
                    updateActiveRange(editor.selection)
                    activeRangeSource = 'expanded'
                    return
                }

                if (item.label === RANGE_ITEMS.maximum.label) {
                    const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0)
                    editor.selection = new vscode.Selection(fullRange.start, fullRange.end)
                    updateActiveRange(editor.selection)
                    activeRangeSource = 'maximum'
                    return
                }
            },
            onDidAccept: () => editInput.render(activeTitle, editInput.input.value),
        })

        const editInput = createQuickPick({
            title: activeTitle,
            placeHolder: 'Instructions (@ to include code)',
            getItems: () =>
                getEditInputItems(params, editInput.input.value, activeRangeSource, activeModel),
            ...(source === 'menu'
                ? {
                      buttons: [vscode.QuickInputButtons.Back],
                      onDidTriggerButton: target => {
                          if (target === vscode.QuickInputButtons.Back) {
                              void vscode.commands.executeCommand('cody.action.commands.menu')
                              editInput.input.hide()
                          }
                      },
                  }
                : {}),
            onDidChangeValue: async value => {
                const input = editInput.input
                if (params.initialValue !== undefined && value === params.initialValue) {
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
                    // Nothing to match, clear existing items
                    // eslint-disable-next-line no-self-assign
                    input.items = getEditInputItems(params, input.value, activeRangeSource, activeModel)
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
                if (selectedItem.label === MODEL_ITEM.label) {
                    modelInput.render(activeTitle, '')
                    return
                }

                if (selectedItem.label === RANGE_ITEM.label) {
                    rangeInput.render(activeTitle, '')
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
                    rangeSource: activeRangeSource,
                })
            },
        })

        editInput.render(activeTitle, params.initialValue || '')
        editInput.input.activeItems = []
        performance.mark(label)

    })
}
