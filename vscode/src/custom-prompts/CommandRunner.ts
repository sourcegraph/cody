import * as vscode from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'

import { getCursorFoldingRange } from '../editor/utils'
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
        if (!selection || !doc) {
            return
        }
        // Get folding range if no selection is found
        if (selection?.start.isEqual(selection.end)) {
            selection = await getCursorFoldingRange(doc.uri, selection.start.line)
        }

        // Get text from selection range
        const code = this.editor?.document.getText(selection)
        if (!code || !selection) {
            return
        }

        const range = this.kind === 'doc' ? getDocCommandRange(doc, selection) : selection
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
            range = await getCursorFoldingRange(doc.uri, range.start.line)
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
 */
function addSelectionToPrompt(prompt: string, code: string): string {
    return prompt + '\nHere is the code: \n<Code>' + code + '</Code>'
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
function getDocCommandRange(doc: vscode.TextDocument, selection: vscode.Selection): vscode.Selection {
    const startLine = doc.languageId === 'python' ? selection.start.line + 1 : selection.start.line
    const pos = new vscode.Position(startLine, 0)
    return new vscode.Selection(pos, pos)
}
