import * as vscode from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'

import { getSmartSelection } from '../editor/utils'
import { logDebug } from '../log'
import { telemetryService } from '../services/telemetry'

/**
 * CommandRunner class implements disposable interface.
 * Manages executing a Cody command and optional fixup.
 *
 * Has id, editor, contextOutput, and disposables properties.
 *
 * Constructor takes command CodyPrompt, instruction string,
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
        private command: CodyPrompt,
        public instruction?: string,
        private isFixupRequest?: boolean
    ) {
        // use commandKey to identify default command in telemetry
        // all user and workspace command type should be logged under 'custom'
        const commandKey = command.slashCommand
        this.kind = command.type === 'default' ? commandKey.replace('/', '') : 'custom'

        // Log commands usage
        telemetryService.log(`CodyVSCodeExtension:command:${this.kind}:executed`, {
            mode: command.mode || 'ask',
            useCodebaseContex: !!command.context?.codebase,
            useShellCommand: !!command.context?.command,
        })

        logDebug('CommandRunner:init', this.kind)

        // Commands only work in active editor / workspace unless context specifies otherwise
        this.editor = vscode.window.activeTextEditor || undefined
        if (!this.editor || command.context?.none) {
            const errorMsg = 'Failed to create command: No active text editor found.'
            logDebug('CommandRunner:int:fail', errorMsg)
            void vscode.window.showErrorMessage(errorMsg)
            return
        }

        if (command.mode === 'inline') {
            void this.handleInlineRequest()
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
     * codyCommand getter returns command CodyPrompt if not a fixup request,
     * otherwise returns null. Updates context output if needed.
     */
    public get codyCommand(): CodyPrompt | null {
        if (this.isFixupRequest) {
            return null
        }
        const context = this.command.context
        if (context) {
            context.output = this.contextOutput
            this.command.context = context
        }
        return this.command
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
        const instruction = insertMode ? addSelectionToPrompt(this.command.prompt, code) : this.command.prompt
        const source = this.kind
        await vscode.commands.executeCommand(
            'cody.command.edit-code',
            {
                range,
                instruction,
                document: doc,
                auto: true,
                insertMode,
            },
            source
        )
    }

    /**
     * handleInlineRequest method handles executing inline request based on editor selection.
     *
     * Gets the current editor selection range and document.
     * Returns early if no range or document.
     * Gets the folding range if selection start equals end.
     *
     * Calls the vscode.commands.executeCommand with the 'cody.inline.add' command,
     * passing the instruction prompt and range.
     *
     * This executes the inline request using the current selection range in the editor.
     */
    private async handleInlineRequest(): Promise<void> {
        logDebug('CommandRunner:handleFixupRequest', 'inline chat request detected')

        let range = this.editor?.selection
        const doc = this.editor?.document
        if (!range || !doc) {
            return
        }
        // Get folding range if no selection is found
        if (range?.start.isEqual(range.end)) {
            range = await getSmartSelection(doc.uri, range.start.line)
        }

        const instruction = this.command.prompt
        await vscode.commands.executeCommand('cody.inline.add', instruction, range)
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
 *
 * @param prompt - The original prompt string
 * @param code - The code snippet to include in the prompt
 * @returns The updated prompt string with the code snippet added
 */
export function addSelectionToPrompt(prompt: string, code: string): string {
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
    languageId?: string
): vscode.Selection {
    const startLine = languageId === 'python' ? selection.start.line + 1 : selection.start.line
    const pos = new vscode.Position(startLine, 0)

    // move the current selection to the defined selection in the text editor document
    if (editor) {
        const visibleRange = editor.visibleRanges
        // reveal the range of the selection minus 5 lines if visibleRange doesn't contain the selection
        if (!visibleRange.some(range => range.contains(selection))) {
            // reveal the range of the selection minus 5 lines
            editor?.revealRange(selection, vscode.TextEditorRevealType.InCenter)
        }
    }

    return new vscode.Selection(pos, pos)
}
