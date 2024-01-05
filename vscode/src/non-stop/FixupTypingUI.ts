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
        return str
    } // Return the original string if "@" is not found
    return str.slice(0, lastIndex)
}

/* Match strings that end with a '@' followed by any characters except a space */
const MATCHING_CONTEXT_FILE_REGEX = /@(\S+)$/

/* Match strings that end with a '@#' followed by any characters except a space */
const MATCHING_SYMBOL_REGEX = /@#(\S+)$/

interface FixupMatchingContext {
    /* Associated text label with the context */
    label: string
    file: ContextFile
}

interface QuickPickParams {
    title?: string
    placeholder?: string
    value?: string
    prefix?: string
    selectedContextFiles?: ContextFile[]
}

/**
 * The UI for creating non-stop fixup tasks by typing instructions.
 */
export class FixupTypingUI {
    constructor(private readonly taskFactory: FixupTaskFactory) {}

    private async getMatchingContext(instruction: string): Promise<FixupMatchingContext[]> {
        const cancellation = new vscode.CancellationTokenSource()
        const symbolMatch = instruction.match(MATCHING_SYMBOL_REGEX)
        if (symbolMatch) {
            const symbolResults = await getSymbolContextFiles(symbolMatch[1], 5)
            return symbolResults.map(result => ({
                file: result,
                label: result.fileName,
            }))
        }

        const fileMatch = instruction.match(MATCHING_CONTEXT_FILE_REGEX)
        if (fileMatch) {
            const fileResults = await getFileContextFiles(fileMatch[1], 5, cancellation.token)
            return fileResults.map(result => ({
                file: result,
                label: result.path?.relative ?? result.fileName,
            }))
        }

        return []
    }

    public async getInputFromQuickPick({
        title = `${EDIT_COMMAND.description} (${EDIT_COMMAND.slashCommand})`,
        placeholder = 'Your instructions',
        value = '',
        selectedContextFiles = [],
        prefix = EDIT_COMMAND.slashCommand,
    }: QuickPickParams = {}): Promise<{
        instruction: string
        userContextFiles: ContextFile[]
    } | null> {
        const quickPick = vscode.window.createQuickPick()
        quickPick.title = title
        quickPick.placeholder = placeholder
        quickPick.buttons = [menu_buttons.back]
        quickPick.value = value

        // ContextItems to store possible context
        const contextItems = new Map<string, ContextFile>()
        const selectedContextItems = new Map<string, ContextFile>()

        // Initialize the selectedContextItems with any previous items
        // This is primarily for edit retries, where a user may want to reuse their context
        selectedContextFiles.forEach(file => {
            // TODO: Fix the label generation, either return with labels or have a single function to determine the label
            selectedContextItems.set(file.fileName, file)
        })

        // VS Code automatically sorts quick pick items by label.
        // We want the 'edit' item to always be first, so we remove this.
        // Property not currently documented, open issue: https://github.com/microsoft/vscode/issues/73904
        ;(quickPick as any).sortByLabel = false

        quickPick.onDidTriggerButton(() => {
            void vscode.commands.executeCommand('cody.action.commands.menu')
            quickPick.hide()
        })

        quickPick.onDidChangeValue(async value => {
            const matchingContext = await this.getMatchingContext(value)
            if (matchingContext.length === 0) {
                // Clear out any existing items
                quickPick.items = []
                return
            }

            // Update stored context items so we can retrieve them later
            for (const { label, file } of matchingContext) {
                contextItems.set(label, file)
            }

            // Add human-friendly labels to the quick pick so the user can select them
            quickPick.items = matchingContext.map(({ label }) => ({ alwaysShow: true, label }))
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
                if (selectedItem && contextItems.has(selectedItem.label)) {
                    // Replace fuzzy value with actual context in input
                    quickPick.value = `${removeAfterLastAt(instruction).trim()} @${selectedItem.label} `
                    selectedContextItems.set(selectedItem.label, contextItems.get(selectedItem.label)!)
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
