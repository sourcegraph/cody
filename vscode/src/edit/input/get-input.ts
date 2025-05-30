import {
    type ContextItem,
    type EditModel,
    type EventSource,
    FILE_CONTEXT_MENTION_PROVIDER,
    GENERAL_HELP_LABEL,
    LARGE_FILE_WARNING_LABEL,
    type PromptString,
    type Rule,
    SYMBOL_CONTEXT_MENTION_PROVIDER,
    parseMentionQuery,
    scanForMentionTriggerInUserTextInput,
} from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

import { telemetryRecorder } from '@sourcegraph/cody-shared'
import { EventSourceTelemetryMetadataMapping } from '@sourcegraph/cody-shared/src/chat/transcript/messages'
import { ACCOUNT_UPGRADE_URL } from '../../chat/protocol'
import { executeDocCommand, executeTestEditCommand } from '../../commands/execute'
import { getEditor } from '../../editor/active-editor'
import type { EditIntent, EditMode } from '../types'
import { EditInputFlow } from './edit-input-flow'
import { DOCUMENT_ITEM, MODEL_ITEM, RANGE_ITEM, TEST_ITEM } from './get-items/edit'
import { RANGE_SYMBOLS_ITEM } from './get-items/range-symbols'
import type { EditModelItem, EditRangeItem } from './get-items/types'
import { createQuickPick } from './quick-pick'

export interface EditInput {
    /** The user provided instruction */
    instruction?: PromptString
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
    /** The derived mode from the users' selected range */
    mode?: EditMode
    /** Rules to apply. */
    rules: Rule[] | null
    expandedRange?: vscode.Range
}

const PREVIEW_RANGE_DECORATION = vscode.window.createTextEditorDecorationType({
    backgroundColor: new vscode.ThemeColor('editor.wordHighlightTextBackground'),
    borderColor: new vscode.ThemeColor('editor.wordHighlightTextBorder'),
    borderWidth: '3px',
    borderStyle: 'solid',
})

export const getInput = async (
    document: vscode.TextDocument,
    initialValues: EditInput,
    source: EventSource
): Promise<EditInput | null> => {
    const editor = getEditor().active
    if (!editor) {
        return null
    }

    telemetryRecorder.recordEvent('cody.menu.edit', 'clicked', {
        metadata: {
            source: EventSourceTelemetryMetadataMapping[source],
        },
        privateMetadata: { source },
    })

    const editFlow = new EditInputFlow(document, initialValues)
    await editFlow.init()

    const previewActiveRange = (range: vscode.Range) => {
        editor.setDecorations(PREVIEW_RANGE_DECORATION, [range])
        editor.revealRange(range, vscode.TextEditorRevealType.InCenterIfOutsideViewport)
    }
    previewActiveRange(editFlow.getActiveRange())

    return new Promise<EditInput | null>(resolve => {
        const disposables: vscode.Disposable[] = []
        disposables.push(editFlow)

        const updateTitle = (newTitle: string) => {
            if (modelInput) modelInput.input.title = newTitle
            if (rangeSymbolsInput) rangeSymbolsInput.input.title = newTitle
            if (rangeInput) rangeInput.input.title = newTitle
            if (editInput) editInput.input.title = newTitle
        }

        const rangeListenerCallback = (newRange: vscode.Range, newTitle: string) => {
            editor.setDecorations(PREVIEW_RANGE_DECORATION, [])
            editor.selection = new vscode.Selection(newRange.start, newRange.end)
            updateTitle(newTitle)
        }

        async function handleRangeSelectionOnAccept(acceptedItem: EditRangeItem): Promise<void> {
            const range =
                acceptedItem.range instanceof vscode.Range
                    ? acceptedItem.range
                    : await acceptedItem.range()
            editFlow.updateActiveRange(range, acceptedItem)
        }

        async function previewRangeOnActiveChange(
            items: readonly vscode.QuickPickItem[]
        ): Promise<void> {
            const item = items[0] as EditRangeItem
            if (item?.range) {
                const range = item.range instanceof vscode.Range ? item.range : await item.range()
                previewActiveRange(range)
            }
        }

        editFlow.setRangeListener(rangeListenerCallback)

        const modelInput = createQuickPick({
            title: editFlow.getActiveTitle(),
            placeHolder: 'Select a model',
            getItems: () => editFlow.getModelInputItems(),
            buttons: [vscode.QuickInputButtons.Back],
            onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
            onDidTriggerButton: () => editInput.render(editInput.input.value),
            onDidAccept: async selected => {
                const acceptedItem = selected as EditModelItem
                if (!acceptedItem) {
                    return
                }
                telemetryRecorder.recordEvent('cody.fixup.input.model', 'selected', {
                    billingMetadata: { product: 'cody', category: 'billable' },
                })

                const modelSelectionResult = await editFlow.selectModel(acceptedItem)
                if (modelSelectionResult.requiresUpgrade) {
                    const option = await vscode.window.showInformationMessage(
                        'Upgrade to Cody Pro',
                        {
                            modal: true,
                            detail: `Upgrade to Cody Pro to use ${modelSelectionResult.modelTitle} for Edit`,
                        },
                        'Upgrade',
                        'See Plans'
                    )
                    if (option) {
                        void vscode.env.openExternal(vscode.Uri.parse(ACCOUNT_UPGRADE_URL.toString()))
                    }
                    return
                }
                editInput.render(editInput.input.value)
            },
        })
        disposables.push(modelInput.input)

        const rangeSymbolsInput = createQuickPick({
            title: editFlow.getActiveTitle(),
            placeHolder: 'Select a symbol',
            getItems: () => editFlow.getRangeSymbolInputItems(),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: () => editInput.render(editInput.input.value),
            onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
            onDidChangeActive: previewRangeOnActiveChange,
            onDidAccept: async selected => {
                const acceptedItem = selected as EditRangeItem
                if (!acceptedItem) {
                    return
                }
                telemetryRecorder.recordEvent('cody.fixup.input.rangeSymbol', 'selected', {
                    billingMetadata: { product: 'cody', category: 'billable' },
                })
                await handleRangeSelectionOnAccept(acceptedItem)
                editInput.render(editInput.input.value)
            },
        })
        disposables.push(rangeSymbolsInput.input)

        const rangeInput = createQuickPick({
            title: editFlow.getActiveTitle(),
            placeHolder: 'Select a range to edit',
            getItems: () => editFlow.getRangeInputItems(),
            buttons: [vscode.QuickInputButtons.Back],
            onDidTriggerButton: () => editInput.render(editInput.input.value),
            onDidHide: () => editor.setDecorations(PREVIEW_RANGE_DECORATION, []),
            onDidChangeActive: previewRangeOnActiveChange,
            onDidAccept: async selected => {
                const acceptedItem = selected as EditRangeItem
                if (!acceptedItem) {
                    return
                }

                if (acceptedItem.label === RANGE_SYMBOLS_ITEM.label) {
                    rangeSymbolsInput.render('')
                    return
                }

                telemetryRecorder.recordEvent('cody.fixup.input.range', 'selected', {
                    billingMetadata: { product: 'cody', category: 'billable' },
                })
                await handleRangeSelectionOnAccept(acceptedItem)
                editInput.render(editInput.input.value)
            },
        })
        disposables.push(rangeInput.input)

        const editInput = createQuickPick({
            title: editFlow.getActiveTitle(),
            placeHolder: 'Enter edit instructions (type @ to include code, ⏎ to submit)',
            getItems: () => editFlow.getEditInputItems(editInput.input.value),
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
                    initialValues.instruction !== undefined &&
                    value.toString() === initialValues.instruction.toString()
                ) {
                    return
                }

                const mentionTrigger = scanForMentionTriggerInUserTextInput({
                    textBeforeCursor: value,
                    includeWhitespace: false,
                })
                const mentionQuery = mentionTrigger
                    ? parseMentionQuery(mentionTrigger.matchingString, null)
                    : undefined

                if (!mentionQuery) {
                    input.items = editFlow.getEditInputItems(input.value).items
                    return
                }

                const matchingContext = await editFlow.getMatchingContextForQuery(mentionQuery)
                if (matchingContext.length === 0) {
                    input.items = [
                        {
                            alwaysShow: true,
                            label:
                                (mentionQuery.provider === SYMBOL_CONTEXT_MENTION_PROVIDER.id
                                    ? mentionQuery.text.length === 0
                                        ? SYMBOL_CONTEXT_MENTION_PROVIDER.queryLabel
                                        : SYMBOL_CONTEXT_MENTION_PROVIDER.emptyLabel
                                    : mentionQuery.text.length === 0
                                      ? FILE_CONTEXT_MENTION_PROVIDER.queryLabel
                                      : FILE_CONTEXT_MENTION_PROVIDER.emptyLabel) ?? '',
                        },
                    ]
                    return
                }

                input.items = [
                    ...matchingContext.map(({ key, shortLabel, item }) => ({
                        alwaysShow: true,
                        label: shortLabel || key,
                        description: shortLabel ? key : undefined,
                        detail: editFlow.isContextOverLimit(value, item.size)
                            ? LARGE_FILE_WARNING_LABEL
                            : undefined,
                    })),
                    {
                        kind: vscode.QuickPickItemKind.Separator,
                        label: 'help',
                    },
                    {
                        alwaysShow: true,
                        label:
                            (mentionQuery?.provider === SYMBOL_CONTEXT_MENTION_PROVIDER.id
                                ? SYMBOL_CONTEXT_MENTION_PROVIDER.queryLabel
                                : mentionQuery?.provider === FILE_CONTEXT_MENTION_PROVIDER.id
                                  ? FILE_CONTEXT_MENTION_PROVIDER.queryLabel
                                  : GENERAL_HELP_LABEL) ?? '',
                    },
                ]
            },
            onDidAccept: () => {
                const input = editInput.input
                const instructionValue = input.value.trim()

                const selectedItem = input.selectedItems[0]
                switch (selectedItem.label) {
                    case MODEL_ITEM.label:
                        modelInput.render('')
                        return
                    case RANGE_ITEM.label:
                        rangeInput.render('')
                        return
                    case DOCUMENT_ITEM.label:
                        input.hide()
                        return executeDocCommand({ range: editFlow.getActiveRange(), source: 'menu' })
                    case TEST_ITEM.label:
                        input.hide()
                        return executeTestEditCommand({
                            range: editFlow.getActiveRange(),
                            source: 'menu',
                        })
                    case FILE_CONTEXT_MENTION_PROVIDER.queryLabel:
                    case FILE_CONTEXT_MENTION_PROVIDER.emptyLabel:
                    case SYMBOL_CONTEXT_MENTION_PROVIDER.queryLabel:
                    case SYMBOL_CONTEXT_MENTION_PROVIDER.emptyLabel:
                    case LARGE_FILE_WARNING_LABEL:
                    case GENERAL_HELP_LABEL:
                        return
                }

                const key = selectedItem?.description || selectedItem?.label
                if (key) {
                    const newInstruction = editFlow.addSelectedContextItem(key, input.value)
                    if (newInstruction !== input.value) {
                        input.value = newInstruction
                        return
                    }
                }

                if (instructionValue.length === 0) {
                    return
                }

                input.hide()
                const finalInput = editFlow.finalizeInput(instructionValue)
                vscode.Disposable.from(...disposables).dispose()
                return resolve(finalInput)
            },
        })
        disposables.push(editInput.input)

        const initialInputString = initialValues.instruction?.toString() || ''
        editInput.render(initialInputString)

        if (initialInputString.length === 0) {
            editInput.input.activeItems = []
        }
    })
}
