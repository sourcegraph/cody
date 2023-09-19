import * as vscode from 'vscode'

import { CodyPrompt } from '@sourcegraph/cody-shared'

import { getCursorFoldingRange } from '../editor/utils'

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

    constructor(
        private command: CodyPrompt,
        public instruction?: string,
        private isFixupRequest?: boolean
    ) {
        this.editor = vscode.window.activeTextEditor || undefined
        if (!this.editor) {
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
        }
    }

    /**
     * handleFixupRequest method handles executing fixup based on editor selection.
     * Creates range and instruction, calls fixup command.
     */
    private async handleFixupRequest(insertMode = false): Promise<void> {
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
        // Insert mode - add code returns by Cody to top of selection
        const range = insertMode ? new vscode.Range(selection.start, selection.start) : selection
        const instruction = insertMode ? addSelectionToPrompt(this.command.prompt, code) : this.command.prompt
        await vscode.commands.executeCommand('cody.fixup.new', {
            range,
            instruction,
            document: doc,
            insertMode,
        })
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

function addSelectionToPrompt(prompt: string, code: string): string {
    return prompt + '\nHere is the code: \n<Code>' + code + '</Code>'
}
