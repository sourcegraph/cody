import {
    type ContextItem,
    parseMentionQuery,
    scanForMentionTriggerInUserTextInput,
} from '@sourcegraph/cody-shared'
import type { ChatModel, EditModel } from '@sourcegraph/cody-shared/src/models/types'
import * as vscode from 'vscode'
import { ACCOUNT_UPGRADE_URL } from '../../chat/protocol'
import type { EditIntent } from '../../edit/types'
import { isGenerateIntent } from '../../edit/utils/edit-intent'
import { getEditor } from '../../editor/active-editor'
import { type TextChange, updateRangeMultipleChanges } from '../../non-stop/tracked-range'
import type { AuthProvider } from '../../services/AuthProvider'
import {
    EditorInputTypeToModelType,
    FILE_HELP_LABEL,
    NO_MATCHES_LABEL,
    OTHER_MENTION_HELP_LABEL,
    PREVIEW_RANGE_DECORATION,
    SYMBOL_HELP_LABEL,
} from './constants'
import { getMatchingContext } from './context/get-matching-context'
import { getSharedInputItems } from './items'
import { CURSOR_RANGE_ITEM, EXPANDED_RANGE_ITEM, SELECTION_RANGE_ITEM } from './items/constants'
import { MODEL_ITEM, getModelInputItems, getModelOptionItems } from './items/model'
import { RANGE_ITEM, getRangeInputItems } from './items/range'
import { RANGE_SYMBOLS_ITEM, getRangeSymbolInputItems } from './items/range-symbols'
import type { ModelItem, RangeItem } from './items/types'
import { createQuickPick } from './quick-pick'
import {
    fetchDocumentSymbols,
    getInputLabels,
    getLabelForContextItem,
    getModelsForUser,
    removeAfterLastAt,
} from './utils'

export type EditorInputType = 'Combined' | 'Chat' | 'Edit'

interface GenericInitialValues {
    initialRange: vscode.Range
    initialExpandedRange?: vscode.Range
    initialInputValue?: string
    initialSelectedContextItems?: ContextItem[]
    initialModel: ChatModel | EditModel
}

interface ChatInitialValues extends GenericInitialValues {
    initialModel: ChatModel
}

interface EditInitialValues extends GenericInitialValues {
    initialModel: EditModel
    initialIntent: EditIntent
}

export interface InitialValues {
    Combined: GenericInitialValues
    Chat: ChatInitialValues
    Edit: EditInitialValues
}

interface GenericOutputValues {
    /** The user provided instruction */
    instruction: string
    /** Any user provided context, from @ or @# */
    userContextFiles: ContextItem[]
    /** The range that the user has selected */
    range: vscode.Range
}

interface ChatOutputValues extends GenericOutputValues {
    model: ChatModel
}

interface EditOutputValues extends GenericOutputValues {
    model: EditModel
    intent: EditIntent
}

interface CombinedOutputValues extends GenericOutputValues {}

export interface OutputValues {
    Combined: CombinedOutputValues
    Chat: ChatOutputValues
    Edit: EditOutputValues
}

export async function showEditorInput<T extends EditorInputType>({
    type,
    document,
    authProvider,
    initialValues,
    additionalItems,
    onDidAccept,
}: {
    type: T
    document: vscode.TextDocument
    authProvider: AuthProvider
    initialValues: InitialValues[T]
    additionalItems: vscode.QuickPickItem[]
    onDidAccept: (args: OutputValues[T], ref: vscode.QuickPick<vscode.QuickPickItem>) => Promise<void>
}): Promise<void> {
    const editor = getEditor().active
    if (!editor) {
        return
    }

    const { title, placeHolder } = getInputLabels(type)
    const initialCursorPosition = editor.selection.active
    let activeRange = initialValues.initialExpandedRange || initialValues.initialRange
    let activeRangeItem =
        'initialIntent' in initialValues && initialValues.initialIntent === 'add'
            ? CURSOR_RANGE_ITEM
            : initialValues.initialExpandedRange
              ? EXPANDED_RANGE_ITEM
              : SELECTION_RANGE_ITEM

    const authStatus = authProvider.getAuthStatus()
    const isCodyPro = !authStatus.userCanUpgrade
    const modelOptions = getModelsForUser(authStatus, type)
    const modelItems = getModelOptionItems(modelOptions, isCodyPro)
    const showModelSelector = modelOptions.length > 1 && authStatus.isDotCom

    let activeModel = initialValues.initialModel
    let activeModelItem = modelItems.find(item => item.model === initialValues.initialModel)

    // ContextItems to store possible user-provided context
    const contextItems = new Map<string, ContextItem>()
    const selectedContextItems = new Map<string, ContextItem>()

    // Initialize the selectedContextItems with any previous items
    // This is primarily for edit retries, where a user may want to reuse their context
    for (const file of initialValues.initialSelectedContextItems ?? []) {
        selectedContextItems.set(getLabelForContextItem(file), file)
    }

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
    }
    const previewActiveRange = (range: vscode.Range) => {
        editor.setDecorations(PREVIEW_RANGE_DECORATION, [range])
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    }
    previewActiveRange(activeRange)

    // Start fetching symbols early, so they can be used immediately if an option is selected
    const symbolsPromise = fetchDocumentSymbols(document)

    const modelInput = createQuickPick({
        title,
        placeHolder: 'Select a model',
        getItems: () => getModelInputItems(modelOptions, activeModel, isCodyPro),
        buttons: [vscode.QuickInputButtons.Back],
        onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
        onDidTriggerButton: () => targetInput.render(targetInput.input.value),
        onDidAccept: async item => {
            const acceptedItem = item as ModelItem
            if (!acceptedItem) {
                return
            }

            if (acceptedItem.codyProOnly && !isCodyPro) {
                // Temporarily ignore focus out, so that the user can return to the quick pick if desired.
                modelInput.input.ignoreFocusOut = true

                const option = await vscode.window.showInformationMessage(
                    'Upgrade to Cody Pro',
                    {
                        modal: true,
                        detail: `Upgrade to Cody Pro to use ${acceptedItem.modelTitle}`,
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

            EditorInputTypeToModelType[type].accessor.set(acceptedItem.model)
            activeModelItem = acceptedItem
            activeModel = acceptedItem.model

            targetInput.render(targetInput.input.value)
        },
    })

    const rangeSymbolsInput = createQuickPick({
        title,
        placeHolder: 'Select a symbol',
        getItems: () =>
            getRangeSymbolInputItems(
                document,
                { ...initialValues, initialCursorPosition },
                activeRange,
                symbolsPromise
            ),
        buttons: [vscode.QuickInputButtons.Back],
        onDidTriggerButton: () => targetInput.render(targetInput.input.value),
        onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
        onDidChangeActive: async items => {
            const item = items[0] as RangeItem
            if (item) {
                const range = item.range instanceof vscode.Range ? item.range : await item.range()
                previewActiveRange(range)
            }
        },
        onDidAccept: async item => {
            const acceptedItem = item as RangeItem
            if (!acceptedItem) {
                return
            }

            activeRangeItem = acceptedItem
            const range =
                acceptedItem.range instanceof vscode.Range
                    ? acceptedItem.range
                    : await acceptedItem.range()

            updateActiveRange(range)
            targetInput.render(targetInput.input.value)
        },
    })

    const rangeInput = createQuickPick({
        title,
        placeHolder: 'Select a range',
        getItems: () =>
            getRangeInputItems(type, document, { ...initialValues, initialCursorPosition }, activeRange),
        buttons: [vscode.QuickInputButtons.Back],
        onDidTriggerButton: () => targetInput.render(targetInput.input.value),
        onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
        onDidChangeActive: async items => {
            const item = items[0] as RangeItem
            if (item) {
                const range = item.range instanceof vscode.Range ? item.range : await item.range()
                previewActiveRange(range)
            }
        },
        onDidAccept: async item => {
            const acceptedItem = item as RangeItem
            if (!acceptedItem) {
                return
            }

            if (acceptedItem.label === RANGE_SYMBOLS_ITEM.label) {
                rangeSymbolsInput.render('')
                return
            }

            activeRangeItem = acceptedItem
            const range =
                acceptedItem.range instanceof vscode.Range
                    ? acceptedItem.range
                    : await acceptedItem.range()

            updateActiveRange(range)
            targetInput.render(targetInput.input.value)
        },
    })

    const targetInput = createQuickPick({
        title,
        placeHolder,
        getItems: () =>
            getSharedInputItems(
                type,
                targetInput.input.value,
                activeRangeItem,
                activeModelItem,
                showModelSelector,
                additionalItems
            ),
        onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
        onDidChangeValue: async value => {
            const input = targetInput.input
            if (
                initialValues.initialInputValue !== undefined &&
                value === initialValues.initialInputValue
            ) {
                // Noop, this event is fired when an initial value is set
                return
            }

            const mentionTrigger = scanForMentionTriggerInUserTextInput(value)
            const mentionQuery = mentionTrigger
                ? parseMentionQuery(mentionTrigger.matchingString)
                : undefined

            // If we have the beginning of a file or symbol match, show a helpful label
            if (mentionQuery?.text === '') {
                if (mentionQuery.type === 'empty' || mentionQuery.type === 'file') {
                    input.items = [{ alwaysShow: true, label: FILE_HELP_LABEL }]
                    return
                }
                if (mentionQuery.type === 'symbol') {
                    input.items = [{ alwaysShow: true, label: SYMBOL_HELP_LABEL }]
                    return
                }
                input.items = [{ alwaysShow: true, label: OTHER_MENTION_HELP_LABEL }]
                return
            }

            const matchingContext = mentionQuery ? await getMatchingContext(mentionQuery) : null
            if (matchingContext === null) {
                // Nothing to match, re-render existing items
                input.items = getSharedInputItems(
                    type,
                    input.value,
                    activeRangeItem,
                    activeModelItem,
                    showModelSelector,
                    additionalItems
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
            const input = targetInput.input
            const instruction = input.value.trim()

            // Selected item flow, update the input and store it for submission
            const selectedItem = input.selectedItems[0]
            switch (selectedItem.label) {
                case MODEL_ITEM.label:
                    modelInput.render('')
                    return
                case RANGE_ITEM.label:
                    rangeInput.render('')
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

            input.hide()
            textDocumentListener.dispose()
            return onDidAccept(
                {
                    instruction: instruction.trim(),
                    userContextFiles: Array.from(selectedContextItems)
                        .filter(([key]) => instruction.includes(`@${key}`))
                        .map(([, value]) => value),
                    model: activeModel,
                    range: activeRange,
                    intent: isGenerateIntent(document, activeRange) ? 'add' : 'edit',
                },
                targetInput.input
            )
        },
    })

    targetInput.render(initialValues.initialInputValue || '')
    targetInput.input.activeItems = []
}
