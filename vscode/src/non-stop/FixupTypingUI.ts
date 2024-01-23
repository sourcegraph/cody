import * as vscode from 'vscode'

import { displayPath, type ChatEventSource, type ContextFile } from '@sourcegraph/cody-shared'

import { EDIT_COMMAND, menu_buttons } from '../commands/utils/menu'
import type { ExecuteEditArguments } from '../edit/execute'
import type { EditMode } from '../edit/types'
import { getEditSmartSelection } from '../edit/utils/edit-selection'
import { getEditor } from '../editor/active-editor'
import { getFileContextFiles, getSymbolContextFiles } from '../editor/utils/editor-context'

import type { FixupTask } from './FixupTask'
import type { FixupTaskFactory } from './roles'
import { updateRangeMultipleChanges, type TextChange } from './tracked-range'

function removeAfterLastAt(str: string): string {
    const lastIndex = str.lastIndexOf('@')
    if (lastIndex === -1) {
        // Return the original string if "@" is not found
        return str
    }
    return str.slice(0, lastIndex)
}

function getLabelForContextFile(file: ContextFile): string {
    const isFileType = file.type === 'file'
    const rangeLabel = file.range ? `:${file.range?.start.line}-${file.range?.end.line}` : ''
    if (isFileType) {
        return `${displayPath(file.uri)}${rangeLabel}`
    }
    return `${displayPath(file.uri)}${rangeLabel}#${file.symbolName}`
}

/**
 * Returns a string representation of the given range, formatted as "{startLine}:{endLine}".
 * If startLine and endLine are the same, returns just the line number.
 */
function getTitleRange(range: vscode.Range): string {
    if (range.isEmpty) {
        // No selected range, return just active line
        return `${range.start.line + 1}`
    }

    const endLine = range.end.character === 0 ? range.end.line - 1 : range.end.line
    if (range.start.line === endLine) {
        // Range only encompasses a single line
        return `${range.start.line + 1}`
    }

    return `${range.start.line + 1}:${endLine + 1}`
}

/* Match strings that end with a '@' followed by any characters except a space */
const MATCHING_CONTEXT_FILE_REGEX = /@(\S+)$/

/* Match strings that end with a '@#' followed by any characters except a space */
const MATCHING_SYMBOL_REGEX = /@#(\S+)$/

const MAX_FUZZY_RESULTS = 20
const FILE_HELP_LABEL = 'Search for a file to include, or type # to search symbols...'
const SYMBOL_HELP_LABEL = 'Search for a symbol to include...'
const NO_MATCHES_LABEL = 'No matches found'

interface FixupMatchingContext {
    /* Unique identifier for the context, shown in the input value but not necessarily in the quick pick selector */
    key: string
    /* If present, will override the key shown in the quick pick selector */
    shortLabel?: string
    file: ContextFile
}

interface QuickPickParams {
    editor?: vscode.TextEditor
    filePath: string
    range: vscode.Range
    source: ChatEventSource
    placeholder?: string
    initialValue?: string
    initialSelectedContextFiles?: ContextFile[]
    prefix?: string
    mode?: EditMode
}

/**
 * The UI for creating non-stop fixup tasks by typing instructions.
 */
export class FixupTypingUI {
    constructor(private readonly taskFactory: FixupTaskFactory) {}

    private async getMatchingContext(instruction: string): Promise<FixupMatchingContext[] | null> {
        const symbolMatch = instruction.match(MATCHING_SYMBOL_REGEX)
        if (symbolMatch) {
            const symbolResults = await getSymbolContextFiles(symbolMatch[1], MAX_FUZZY_RESULTS)
            return symbolResults.map(result => ({
                key: getLabelForContextFile(result),
                file: result,
                shortLabel: `${result.kind === 'class' ? '$(symbol-structure)' : '$(symbol-method)'} ${
                    result.symbolName
                }`,
            }))
        }

        const fileMatch = instruction.match(MATCHING_CONTEXT_FILE_REGEX)
        if (fileMatch) {
            const cancellation = new vscode.CancellationTokenSource()
            const fileResults = await getFileContextFiles(
                fileMatch[1],
                MAX_FUZZY_RESULTS,
                cancellation.token
            )
            return fileResults.map(result => ({
                key: getLabelForContextFile(result),
                file: result,
            }))
        }

        return null
    }

    public async getInputFromQuickPick({
        editor,
        filePath,
        range,
        source,
        placeholder = 'Instructions (@ to include code)',
        initialValue,
        initialSelectedContextFiles = [],
        prefix = EDIT_COMMAND.slashCommand,
        mode = 'edit',
    }: QuickPickParams): Promise<{
        instruction: string
        userContextFiles: ContextFile[]
    } | null> {
        const quickPick = vscode.window.createQuickPick()
        const relativeFilePath = vscode.workspace.asRelativePath(filePath)
        const fileRange = getTitleRange(range)
        const title = `Edit ${relativeFilePath}:${fileRange} with Cody`
        quickPick.title = title
        quickPick.placeholder = placeholder
        if (initialValue) {
            quickPick.value = initialValue
        }
        quickPick.matchOnDescription = false
        quickPick.matchOnDetail = false

        const options: vscode.QuickPickItem[] = [
            {
                label: 'modifiers',
                kind: vscode.QuickPickItemKind.Separator,
            },
            {
                label: 'Mode',
                detail: '$(edit) Edit',
                alwaysShow: true,
            },
            {
                label: 'Range',
                detail: '$(code) Selection',
                alwaysShow: true,
            },
            {
                label: 'Model',
                detail: '$(anthropic-logo) Claude 2.1',
                alwaysShow: true,
            },
            {
                label: 'history',
                kind: vscode.QuickPickItemKind.Separator,
            },
            {
                label: 'Add comments to this code',
                alwaysShow: true,
            },
            {
                label: 'Improve error handling using @src/log.ts',
                alwaysShow: true,
            },
            {
                label: 'make this more readable',
                alwaysShow: true,
            },
            {
                label: 'convert to typescript and add a jsdoc',
                alwaysShow: true,
            },
            {
                label: 'Generate a heading component that can be configured to show any h1, h2, etc',
                alwaysShow: true,
            },
        ]

        quickPick.items = options
        quickPick.activeItems = []

        // Change mode quick pick
        const editModeQuickPick = vscode.window.createQuickPick()
        editModeQuickPick.title = title
        editModeQuickPick.placeholder = 'Change Mode'
        editModeQuickPick.items = [
            {
                label: 'active',
                kind: vscode.QuickPickItemKind.Separator,
            },
            {
                label: '$(edit) Edit',
                detail: 'Cody will edit the selected code',
            },
            {
                label: 'options',
                kind: vscode.QuickPickItemKind.Separator,
            },
            {
                label: '$(wand) Generate',
                detail: 'Cody will only generate new code',
            },
            {
                label: '$(lightbulb-autofix) Fix',
                detail: 'Cody will fix any errors in the selected code',
            },
        ]

        editModeQuickPick.onDidAccept(() => {
            void this.getInputFromQuickPick({
                editor,
                filePath,
                range,
                source,
                initialValue: quickPick.value,
                initialSelectedContextFiles: [...selectedContextItems.values()],
            })
            editModeQuickPick.hide()
        })

        // Change model quick pick
        const modelQuickPick = vscode.window.createQuickPick()
        modelQuickPick.title = title
        modelQuickPick.placeholder = 'Change Model'
        modelQuickPick.items = [
            {
                label: 'active',
                kind: vscode.QuickPickItemKind.Separator,
            },
            {
                label: '$(anthropic-logo) Claude 2.1',
                description: 'by Anthropic',
            },
            {
                label: 'options',
                kind: vscode.QuickPickItemKind.Separator,
            },
            {
                label: '$(anthropic-logo) Claude Instant',
                description: 'by Anthropic',
            },
            {
                label: '$(openai-logo) GPT-3.5',
                description: 'by OpenAI',
            },
            {
                label: '$(openai-logo) GPT-4',
                description: 'by OpenAI',
            },
            {
                label: '$(mixtral-logo) Mixtral 8x7B',
                description: 'by Mistral',
            },
        ]

        modelQuickPick.onDidAccept(() => {
            void this.getInputFromQuickPick({
                editor,
                filePath,
                range,
                source,
                initialValue: quickPick.value,
                initialSelectedContextFiles: [...selectedContextItems.values()],
            })
            modelQuickPick.hide()
        })

        // Change range quick pick
        let rangeQuickPick: vscode.QuickPick<vscode.QuickPickItem> | undefined
        if (mode === 'edit') {
            rangeQuickPick = vscode.window.createQuickPick()
            rangeQuickPick.title = title
            rangeQuickPick.placeholder = 'Change Range'
            rangeQuickPick.items = [
                {
                    label: 'active',
                    kind: vscode.QuickPickItemKind.Separator,
                },
                {
                    label: '$(code) Selection',
                    description: `${relativeFilePath}:${fileRange}`,
                    alwaysShow: true,
                },
                {
                    label: 'options',
                    kind: vscode.QuickPickItemKind.Separator,
                },
                {
                    label: '$(file-code) Expanded selection',
                    description: 'Expand the selection to the nearest block of code',
                    alwaysShow: true,
                },
                {
                    label: '$(symbol-file) Entire file',
                    description: `${relativeFilePath}`,
                    alwaysShow: true,
                },
            ]

            rangeQuickPick.onDidChangeActive(async activeItems => {
                const item = activeItems[0]

                if (!editor) {
                    return
                }

                if (item.label === '$(code) Selection') {
                    editor.selection = new vscode.Selection(range.start, range.end)
                    return
                }

                if (item.label === '$(symbol-file) Entire file') {
                    const fullRange = new vscode.Range(0, 0, editor.document.lineCount, 0)
                    editor.selection = new vscode.Selection(fullRange.start, fullRange.end)
                    return
                }

                if (item.label === '$(file-code) Expanded selection') {
                    const smartSelection = await getEditSmartSelection(editor.document, range, {
                        ignoreSelection: true,
                    })
                    editor.selection = new vscode.Selection(smartSelection.start, smartSelection.end)
                }
            })

            rangeQuickPick.onDidAccept(() => {
                void this.getInputFromQuickPick({
                    editor,
                    filePath,
                    range,
                    source,
                    initialValue: quickPick.value,
                    initialSelectedContextFiles: [...selectedContextItems.values()],
                })
                rangeQuickPick?.hide()
            })
        }

        // ContextItems to store possible context
        const contextItems = new Map<string, ContextFile>()
        const selectedContextItems = new Map<string, ContextFile>()

        // Initialize the selectedContextItems with any previous items
        // This is primarily for edit retries, where a user may want to reuse their context
        for (const file of initialSelectedContextFiles) {
            selectedContextItems.set(getLabelForContextFile(file), file)
        }
        // VS Code automatically sorts quick pick items by label.
        // Property not currently documented, open issue: https://github.com/microsoft/vscode/issues/73904
        ;(quickPick as any).sortByLabel = false

        if (source === 'menu') {
            quickPick.buttons = [menu_buttons.back]
            quickPick.onDidTriggerButton((target: vscode.QuickInputButton) => {
                if (target === menu_buttons.back) {
                    void vscode.commands.executeCommand('cody.action.commands.menu')
                    quickPick.hide()
                }
            })
        }

        quickPick.onDidChangeValue(async newValue => {
            if (initialValue !== undefined && newValue === initialValue) {
                // Noop, this event is fired when an initial value is set
                return
            }

            const isFileSearch = newValue.endsWith('@')
            const isSymbolSearch = newValue.endsWith('@#')

            // If we have the beginning of a file or symbol match, show a helpful label
            if (isFileSearch) {
                quickPick.items = [{ alwaysShow: true, label: FILE_HELP_LABEL }]
                return
            }
            if (isSymbolSearch) {
                quickPick.items = [{ alwaysShow: true, label: SYMBOL_HELP_LABEL }]
                return
            }

            const matchingContext = await this.getMatchingContext(newValue)
            if (matchingContext === null) {
                // Nothing to match, clear existing items
                // eslint-disable-next-line no-self-assign
                quickPick.items = [
                    {
                        label: 'Submit',
                        detail: 'Enter your instructions (@ to include code)',
                        alwaysShow: true,
                    },
                    ...options,
                ]
                return
            }

            if (matchingContext.length === 0) {
                // Attempted to match but found nothing
                quickPick.items = [{ alwaysShow: true, label: NO_MATCHES_LABEL }]
                return
            }

            // Update stored context items so we can retrieve them later
            for (const { key, file } of matchingContext) {
                contextItems.set(key, file)
            }

            // Add human-friendly labels to the quick pick so the user can select them
            quickPick.items = matchingContext.map(({ key, shortLabel }) => ({
                alwaysShow: true,
                label: shortLabel || key,
                description: shortLabel ? key : undefined,
            }))
            return
        })

        quickPick.show()

        return new Promise(resolve =>
            quickPick.onDidAccept(() => {
                const instruction = quickPick.value.trim()

                // Selected item flow, update the input and store it for submission
                const selectedItem = quickPick.selectedItems[0]
                if (selectedItem.label === 'Mode') {
                    editModeQuickPick.show()
                    return
                }

                if (selectedItem.label === 'Model') {
                    modelQuickPick.show()
                    return
                }

                if (selectedItem.label === 'Range') {
                    rangeQuickPick?.show()
                    return
                }

                // Empty input flow, do nothing
                if (!instruction) {
                    return
                }

                // The `key` is provided as the `description` for symbol items, use this if available.
                const key = selectedItem?.description || selectedItem?.label
                if (selectedItem) {
                    const contextItem = contextItems.get(key)
                    if (contextItem) {
                        // Replace fuzzy value with actual context in input
                        quickPick.value = `${removeAfterLastAt(instruction)}@${key} `
                        selectedContextItems.set(key, contextItem)
                        return
                    }
                }

                // Submission flow, validate selected items and return final output
                quickPick.hide()
                return resolve({
                    instruction: `${prefix} ${instruction}`.trim(),
                    userContextFiles: Array.from(selectedContextItems)
                        .filter(([key]) => instruction.includes(`@${key}`))
                        .map(([, value]) => value),
                })
            })
        )
    }

    public async show(args: ExecuteEditArguments, source: ChatEventSource): Promise<FixupTask | null> {
        const editor = getEditor().active
        if (!editor) {
            return null
        }
        const document = args.document || editor.document
        let range = args.range || editor.selection
        if (!document || !range) {
            return null
        }

        /**
         * Listens for text document changes and updates the range when changes occur.
         * This allows the range to stay in sync if the user continues editing after
         * requesting the refactoring.
         */
        const textDocumentListener = vscode.workspace.onDidChangeTextDocument(event => {
            if (event.document !== document) {
                return
            }

            const changes = new Array<TextChange>(...event.contentChanges)
            range = updateRangeMultipleChanges(range, changes)
        })

        const input = await this.getInputFromQuickPick({
            editor,
            filePath: document.uri.fsPath,
            range,
            source,
            mode: args.mode,
        })
        if (!input) {
            return null
        }

        const task = this.taskFactory.createTask(
            document,
            input.instruction,
            input.userContextFiles,
            range,
            args.intent,
            args.mode,
            source
        )

        textDocumentListener.dispose()

        // Return focus to the editor
        void vscode.window.showTextDocument(document)

        return task
    }
}
    }
}
    }
}
    }
}
    }
}
    }
}
    }
}
    }
}
    }
}
    }
}
