import * as vscode from 'vscode'

import { ContextFile } from '@sourcegraph/cody-shared'
import { ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { EDIT_COMMAND, menu_buttons } from '../commands/utils/menu'
import { ExecuteEditArguments } from '../edit/execute'
import { getEditor } from '../editor/active-editor'
import { getFileContextFiles, getSymbolContextFiles } from '../editor/utils/editor-context'

import { FixupTask } from './FixupTask'
import { FixupTaskFactory } from './roles'

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
        return `${file.path?.relative}${rangeLabel}`
    }
    return `${file.path?.relative}${rangeLabel}#${file.fileName}`
}

/* Match strings that end with a '@' followed by any characters except a space */
const MATCHING_CONTEXT_FILE_REGEX = /@(\S+)$/

/* Match strings that end with a '@#' followed by any characters except a space */
const MATCHING_SYMBOL_REGEX = /@#(\S+)$/

const MAX_FUZZY_RESULTS = 20
const FILE_HELP_LABEL = 'Search for a file to include, or type # to search symbols..'
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
    title?: string
    placeholder?: string
    initialValue?: string
    initialSelectedContextFiles?: ContextFile[]
    prefix?: string
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
                    result.fileName
                }`,
            }))
        }

        const fileMatch = instruction.match(MATCHING_CONTEXT_FILE_REGEX)
        if (fileMatch) {
            const cancellation = new vscode.CancellationTokenSource()
            const fileResults = await getFileContextFiles(fileMatch[1], MAX_FUZZY_RESULTS, cancellation.token)
            return fileResults.map(result => ({
                key: getLabelForContextFile(result),
                file: result,
            }))
        }

        return null
    }

    public async getInputFromQuickPick({
        title = `${EDIT_COMMAND.description} (${EDIT_COMMAND.slashCommand})`,
        placeholder = 'Your instructions',
        initialValue = '',
        initialSelectedContextFiles = [],
        prefix = EDIT_COMMAND.slashCommand,
    }: QuickPickParams = {}): Promise<{
        instruction: string
        userContextFiles: ContextFile[]
    } | null> {
        const quickPick = vscode.window.createQuickPick()
        quickPick.title = title
        quickPick.placeholder = placeholder
        quickPick.buttons = [menu_buttons.back]
        quickPick.value = initialValue

        // ContextItems to store possible context
        const contextItems = new Map<string, ContextFile>()
        const selectedContextItems = new Map<string, ContextFile>()

        // Initialize the selectedContextItems with any previous items
        // This is primarily for edit retries, where a user may want to reuse their context
        initialSelectedContextFiles.forEach(file => {
            selectedContextItems.set(getLabelForContextFile(file), file)
        })

        // VS Code automatically sorts quick pick items by label.
        // Property not currently documented, open issue: https://github.com/microsoft/vscode/issues/73904
        ;(quickPick as any).sortByLabel = false

        quickPick.onDidTriggerButton(() => {
            void vscode.commands.executeCommand('cody.action.commands.menu')
            quickPick.hide()
        })

        quickPick.onDidChangeValue(async newValue => {
            if (newValue === initialValue) {
                // Noop, this event is fired when an initial value is set
                return
            }

            // If we have the beginning of a file or symbol match, show a helpful label
            if (newValue.endsWith('@')) {
                quickPick.items = [{ alwaysShow: true, label: FILE_HELP_LABEL }]
                return
            }
            if (newValue.endsWith('@#')) {
                quickPick.items = [{ alwaysShow: true, label: SYMBOL_HELP_LABEL }]
                return
            }

            const matchingContext = await this.getMatchingContext(newValue)
            if (matchingContext === null) {
                // Nothing to match, clear existing items
                quickPick.items = []
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

                // Empty input flow, do nothing
                if (!instruction) {
                    return
                }

                // Selected item flow, update the input and store it for submission
                const selectedItem = quickPick.selectedItems[0]
                // The `key` is provided as the `description` for symbol items, use this if available.
                const key = selectedItem?.description || selectedItem?.label
                if (selectedItem) {
                    const contextItem = contextItems.get(key)
                    if (contextItem) {
                        // Replace fuzzy value with actual context in input
                        quickPick.value = `${removeAfterLastAt(instruction)}@${key} `
                        selectedContextItems.set(key, contextItem)
                    }
                    return
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
        const document = args.document || editor?.document
        const range = args.range || editor?.selection
        if (!document || !range) {
            return null
        }
        const input = await this.getInputFromQuickPick()
        if (!input) {
            return null
        }

        const task = this.taskFactory.createTask(
            document.uri,
            input.instruction,
            input.userContextFiles,
            range,
            args.intent,
            args.insertMode,
            source
        )

        // Return focus to the editor
        void vscode.window.showTextDocument(document)

        return task
    }
}
