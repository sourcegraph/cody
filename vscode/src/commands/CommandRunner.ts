import * as vscode from 'vscode'

import { type CodyCommand } from '@sourcegraph/cody-shared'
import { type ChatEventSource } from '@sourcegraph/cody-shared/src/chat/transcript/messages'

import { executeEdit, type ExecuteEditArguments } from '../edit/execute'
import { type EditIntent } from '../edit/types'
import { getEditor } from '../editor/active-editor'
import { getSmartSelection } from '../editor/utils'
import { logDebug } from '../log'
import { telemetryService } from '../services/telemetry'
import { telemetryRecorder } from '../services/telemetry-v2'

/**
 * CommandRunner class implements disposable interface.
 * Manages executing a Cody command and optional fixup.
 *
 * Has id, editor, contextOutput, and disposables properties.
 *
 * Constructor takes command CodyCommand, instruction string,
 * and isFixupRequest boolean. Sets up editor and calls runFixup if needed.
 *
 * TODO bee add status
 */
export class CommandRunner implements vscode.Disposable {
    public readonly id = `c${Date.now().toString(36).replaceAll(/\d+/g, '')}`
    private editor: vscode.TextEditor | undefined = undefined
    private contextOutput: string | undefined = undefined
    private disposables: vscode.Disposable[] = []
    private kind: string

    constructor(
        private command: CodyCommand,
        public instruction?: string,
        private isFixupRequest?: boolean
    ) {
        // use commandKey to identify default command in telemetry
        const commandKey = command.slashCommand
        // all user and workspace custom command should be logged under 'custom'
        this.kind = command.type === 'default' ? commandKey.replace('/', '') : 'custom'

        if (instruction?.startsWith('/edit ')) {
            command.mode = 'edit'
        } else {
            command.mode = command.mode || 'ask'
        }

        // Log non-edit commands usage
        if (command.mode === 'ask') {
            telemetryService.log(`CodyVSCodeExtension:command:${this.kind}:executed`, {
                mode: command.mode,
                useCodebaseContex: !!command.context?.codebase,
                useShellCommand: !!command.context?.command,
                requestID: command.requestID,
            })
            telemetryRecorder.recordEvent(`cody.command.${this.kind}`, 'executed', {
                metadata: {
                    useCodebaseContex: command.context?.codebase ? 1 : 0,
                    useShellCommand: command.context?.command ? 1 : 0,
                },
                interactionID: command.requestID,
                privateMetadata: {
                    mode: command.mode,
                    requestID: command.requestID,
                },
            })
        }

        logDebug('CommandRunner:init', this.kind)

        // Commands only work in active editor / workspace unless context specifies otherwise
        const editor = getEditor()
        if (editor.ignored && !editor.active) {
            const errorMsg = 'Failed to create command: file was ignored by Cody.'
            logDebug('CommandRunner:int:fail', errorMsg)
            void vscode.window.showErrorMessage(errorMsg)
            return
        }

        this.editor = editor.active
        if (!this.editor && command.context?.none && command.slashCommand !== '/ask') {
            const errorMsg = 'Failed to create command: No active text editor found.'
            logDebug('CommandRunner:int:fail', errorMsg)
            void vscode.window.showErrorMessage(errorMsg)
            return
        }

        // Run fixup if this is a edit command
        const insertMode = command.mode === 'insert'
        const fixupMode = command.mode === 'edit' || instruction?.startsWith('/edit ')
        this.isFixupRequest = isFixupRequest || fixupMode || insertMode
        if (this.isFixupRequest) {
            void this.handleFixupRequest(insertMode)
            return
        }
    }

    /**
     * runShell method sets contextOutput and updates command context.
     */
    public async runShell(output: Promise<string | undefined>): Promise<void> {
        this.contextOutput = await output
        const context = this.command.context
        if (context) {
            context.output = this.contextOutput
            this.command.context = context

            logDebug('CommandRunner:runShell:output', 'found', {
                verbose: { command: this.command.context?.command },
            })
        }
    }

    /**
     * handleFixupRequest method handles executing fixup based on editor selection.
     * Creates range and instruction, calls fixup command.
     */
    private async handleFixupRequest(insertMode = false): Promise<void> {
        logDebug('CommandRunner:handleFixupRequest', 'fixup request detected')

        let selection = this.editor?.selection
        const doc = this.editor?.document
        if (!this.editor || !selection || !doc) {
            return
        }
        // Get folding range if no selection is found
        // or use current line range if no folding range is found
        if (selection?.start.isEqual(selection.end)) {
            const curLine = selection.start.line
            const curLineRange = doc.lineAt(curLine).range
            selection =
                (await getSmartSelection(doc.uri, curLine)) ||
                new vscode.Selection(curLineRange.start, curLineRange.end)
            if (selection?.isEmpty) {
                return
            }
        }

        // Get text from selection range
        const code = this.editor?.document.getText(selection)
        if (!code || !selection) {
            return
        }

        const range = this.kind === 'doc' ? getDocCommandRange(this.editor, selection, doc.languageId) : selection
        const intent: EditIntent = this.kind === 'doc' ? 'doc' : 'edit'
        const instruction = insertMode ? addSelectionToPrompt(this.command.prompt, code) : this.command.prompt
        const source = this.kind === 'custom' ? 'custom-commands' : this.kind
        await executeEdit(
            {
                range,
                instruction,
                document: doc,
                intent,
                insertMode,
            } satisfies ExecuteEditArguments,
            source as ChatEventSource
        )
    }

    /**
     * dispose method cleans up disposables.
     */
    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}

/**
 * Adds the selection range to the prompt string.
 * @param prompt - The original prompt string
 * @param code - The code snippet to include in the prompt
 * @returns The updated prompt string with the code snippet added
 */
function addSelectionToPrompt(prompt: string, code: string): string {
    return prompt + '\nHere is the code: \n<code>' + code + '</code>'
}

/**
 * Gets the range to use for inserting documentation from the doc command.
 *
 * For Python files, returns a range starting on the line after the selection,
 * at the first non-whitespace character. This will insert the documentation
 * on the next line instead of directly in the selection as python docstring
 * is added below the function definition.
 *
 * For other languages, returns the original selection range unmodified.
 */
function getDocCommandRange(
    editor: vscode.TextEditor,
    selection: vscode.Selection,
    languageId: string
): vscode.Selection {
    const startLine = languageId === 'python' ? selection.start.line + 1 : selection.start.line
    const adjustedStartPosition = new vscode.Position(startLine, 0)

    if (editor && !editor.visibleRanges.some(range => range.contains(adjustedStartPosition))) {
        // reveal the range of the selection if visibleRange doesn't contain the selection
        // we only use the start position as it is possible that the selection covers more than the entire visible area
        editor.revealRange(selection, vscode.TextEditorRevealType.InCenter)
    }

    return new vscode.Selection(adjustedStartPosition, selection.end)
}
