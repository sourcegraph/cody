import * as vscode from 'vscode'

import {
    checkHasSameNumberOfSpacesAsStartLine,
    checkIsStartOfFunctionOrClass,
    startsWithWord,
} from './text-doc-helpers'

interface EditorCodeLens {
    name: string
    selection: vscode.Selection
}

/**
 * Adds Code lenses for triggering Recipes Menu and inline Chat (when enabled)
 * on top of all the functions in active documents
 */
export class EditorCodeLenses implements vscode.CodeLensProvider {
    private isEnabled = false
    private isInlineChatEnabled = true

    private _disposables: vscode.Disposable[] = []
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event
    constructor() {
        this.provideCodeLenses = this.provideCodeLenses.bind(this)
        this.updateConfig()
        vscode.workspace.onDidChangeConfiguration(e => {
            if (e.affectsConfiguration('cody')) {
                this.updateConfig()
            }
        })
    }
    /**
     * init
     */
    private init(): void {
        if (!this.isEnabled) {
            return
        }
        this._disposables.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this))
        this._disposables.push(
            vscode.commands.registerCommand('cody.editor.codelens.click', async lens => {
                const clickedLens = lens as EditorCodeLens
                await this.onCodeLensClick(clickedLens)
            })
        )
        // on change events for toggling
        this._disposables.push(
            vscode.window.onDidChangeVisibleTextEditors(() => this.fire()),
            vscode.window.onDidChangeActiveTextEditor(() => this.fire()),
            vscode.window.onDidChangeTextEditorVisibleRanges(() => this.fire())
        )
    }
    /**
     * Update the configurations
     */
    private updateConfig(): void {
        const config = vscode.workspace.getConfiguration('cody')
        this.isEnabled = config.get('experimental.customCommands') as boolean
        this.isInlineChatEnabled =
            (config.get('inlineChat.enabled') as boolean) && (config.get('inlineChat.codeLenses') as boolean)
        if (this.isEnabled && !this._disposables.length) {
            this.init()
        }
        this.fire()
    }
    /**
     * Handle the code lens click event
     */
    private async onCodeLensClick(lens: EditorCodeLens): Promise<void> {
        // Update selection in active editor to the selection of the clicked code lens
        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor) {
            activeEditor.selection = lens.selection
        }
        await vscode.commands.executeCommand(lens.name)
    }
    /**
     * Gets the code lenses for the specified document.
     */
    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        if (!this.isEnabled) {
            return []
        }
        token.onCancellationRequested(() => [])
        const editor = vscode.window.activeTextEditor
        if (!editor || editor.document !== document || document.languageId === 'json') {
            return []
        }
        // Generate code lenses for the document.
        const codeLenses = []
        const codeLensesMap = new Map<string, vscode.Range>()
        // Create codelens for visible functions only
        // Add n lines before and after the visible range as buffer to avoid flickering / line jumping
        const nBufferLines = 50
        const visibleRanges = editor.visibleRanges
        const lineCount = Math.min(visibleRanges[0].end.line + nBufferLines, document.lineCount)
        const startLine = Math.max(visibleRanges[0].start.line - nBufferLines, 0)
        // Iterate over each function in the document
        for (let i = startLine; i < lineCount; i++) {
            const line = document.lineAt(i)
            const isStartOfFunction = checkIsStartOfFunctionOrClass(line.text)
            if (isStartOfFunction) {
                // Create a CodeLens object for the function
                const firstLineOfFunction = new vscode.Range(i, 0, i, line.range.end.character)
                const functionRange = this.getFunctionCodeRange(editor, firstLineOfFunction.start.line)
                const selection = new vscode.Selection(functionRange.start, functionRange.end)

                codeLenses.push(
                    new vscode.CodeLens(firstLineOfFunction, {
                        ...editorCodeLenses.cody,
                        arguments: [{ name: 'cody.action.commands.menu', selection }],
                    })
                )

                if (this.isInlineChatEnabled) {
                    codeLenses.push(
                        new vscode.CodeLens(firstLineOfFunction, {
                            ...editorCodeLenses.inline,
                            arguments: [{ name: 'cody.inline.new', selection }],
                        })
                    )
                }

                codeLensesMap.set(i.toString(), firstLineOfFunction)
            }
        }
        return codeLenses
    }
    /**
     * Get the range for the function from the code lens range
     * the function range is from the line of the function
     * to the line where the next function starts or the end of the document
     */
    private getFunctionCodeRange(editor: vscode.TextEditor, startLine: number): vscode.Range {
        if (!editor) {
            return new vscode.Range(0, 0, 0, 0)
        }
        const document = editor.document
        const lineCount = document.lineCount
        const endLine = this._getFunctionEndLine(startLine, lineCount, document)
        return new vscode.Range(startLine, 0, Math.min(endLine, lineCount - 1), 0)
    }
    /**
     * Get the line where the function ends
     */
    private _getFunctionEndLine(startLine: number, lineCount: number, document: vscode.TextDocument): number {
        if (!document) {
            return 0
        }
        const startLineText = document.lineAt(startLine).text
        const isStartLineStartedWithWord = startsWithWord(startLineText)
        // Iterate forwards util we find the line that:
        // - starts with a } or
        // - is start of a new function
        for (let i = startLine + 1; i < lineCount; i++) {
            const text = document.lineAt(i).text
            // If the start line text does not start with space or tab
            // then the end line should start with word without space or tab
            if (isStartLineStartedWithWord) {
                if (startsWithWord(text)) {
                    return i - 1
                }
            } else {
                const isStartLineEndedWithOpeningCurlyBracket = startLineText.match(/^\s*{$/)
                const isEndLineStartedWithClosingCurlyBracket = text.match(/^\s*}$/)
                if (isStartLineEndedWithOpeningCurlyBracket && isEndLineStartedWithClosingCurlyBracket) {
                    return i + 1
                }
                // if line is the start of a new function
                const isStartOfFunction = checkIsStartOfFunctionOrClass(text)
                if (isStartOfFunction && text.length > 0) {
                    return i - 1
                }
                if (checkHasSameNumberOfSpacesAsStartLine(startLineText, text)) {
                    return i - 1
                }
            }
        }
        return lineCount
    }
    /**
     * Fire an event to notify VS Code that the code lenses have changed.
     */
    public fire(): void {
        if (!this.isEnabled) {
            this.dispose()
            return
        }
        this._onDidChangeCodeLenses.fire()
    }
    /**
     * Dispose the disposables
     */
    public dispose(): void {
        if (!this._disposables.length) {
            return
        }
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}

const editorCodeLenses = {
    cody: { title: '$(cody-logo) Cody', command: 'cody.editor.codelens.click', tooltip: 'Open command menu' },
    inline: { title: 'Inline Chat', command: 'cody.editor.codelens.click', tooltip: 'Ask Cody inline' },
}
