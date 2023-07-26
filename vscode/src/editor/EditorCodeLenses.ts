import * as vscode from 'vscode'

interface EditorCodeLens {
    name: string
    selection: vscode.Selection
}

/**
 * Adds Code lenses to the functions in the document
 */
export class EditorCodeLenses implements vscode.CodeLensProvider {
    private _disposables: vscode.Disposable[] = []
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event
    /**
     * Create a code lens provider
     */
    constructor() {
        // new EditorDecorator()
        this.provideCodeLenses = this.provideCodeLenses.bind(this)
        this._disposables.push(vscode.languages.registerCodeLensProvider('*', this))
        this._disposables.push(
            vscode.commands.registerCommand('cody.editor.codelens.click', async lens => {
                const clickedLens = lens as EditorCodeLens
                await this.onCodeLensClick(clickedLens)
            }),
            vscode.window.onDidChangeActiveTextEditor(() => this.fire()),
            vscode.window.onDidChangeTextEditorVisibleRanges(() => this.fire())
        )
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
        token.onCancellationRequested(() => [])
        const codeLenses = []
        const codeLensesMap = new Map<string, vscode.Range>()
        const editor = vscode.window.activeTextEditor
        if (!editor || editor.document !== document) {
            return []
        }
        // Create codelens for visible functions only
        // Add n lines before and after the visible range as buffer to avoid flickering / line jumping
        const nBufferLines = 50
        const visibleRanges = editor.visibleRanges
        const lineCount = Math.min(visibleRanges[0].end.line + nBufferLines, document.lineCount)
        const startLine = Math.max(visibleRanges[0].start.line - nBufferLines, 0)
        // Iterate over each function in the document
        for (let i = startLine; i < lineCount; i++) {
            const line = document.lineAt(i)
            const isStartOfFunction = checkIfLineStartsWith(line.text)
            if (isStartOfFunction) {
                // Create a CodeLens object for the function
                const range = new vscode.Range(i, 0, i, line.range.end.character)
                const functionRange = this.getFunctionCodeRange(editor, range.start.line)
                const selection = new vscode.Selection(functionRange.start, functionRange.end)
                const ask = new vscode.CodeLens(range, {
                    title: '$(cody-logo) Cody',
                    command: 'cody.editor.codelens.click',
                    tooltip: 'Ask Cody for help with below method',
                    arguments: [{ name: 'cody.customRecipes.list', selection }],
                })
                const inline = new vscode.CodeLens(range, {
                    title: 'Inline',
                    command: 'cody.editor.codelens.click',
                    tooltip: 'Ask Cody inline',
                    arguments: [{ name: 'cody.inline.new', selection }],
                })
                codeLensesMap.set(i.toString(), range)
                codeLenses.push(ask, inline)
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
        const startLineStartsWithWord = checkIfLineStartsWithWord(startLineText)
        // Iterate forwards util we find the line that:
        // - starts with a } or
        // - is start of a new function
        for (let i = startLine + 1; i < lineCount; i++) {
            const text = document.lineAt(i).text
            // If the start line text does not start with space or tab
            // then the end line should start with word without space or tab
            if (startLineStartsWithWord) {
                if (checkIfLineStartsWithWord(text)) {
                    return i - 1
                }
            } else {
                // if start line end with opening curly bracket and end line starts with closing curly bracket
                const startLineEndsWithOpeningCurlyBracket = startLineText.match(/^\s*{$/)
                const lineStartWithClosingCurlyBracket = text.match(/^\s*}$/)
                if (startLineEndsWithOpeningCurlyBracket && lineStartWithClosingCurlyBracket) {
                    return i + 1
                }
                // if line is the start of a new function
                const isStartOfFunction = checkIfLineStartsWith(text)
                if (isStartOfFunction && text.length > 0) {
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
        this._onDidChangeCodeLenses.fire()
    }
    /**
     * Dispose the disposables
     */
    public dispose(): void {
        // this.codeLenses = []
        for (const disposable of this._disposables) {
            disposable.dispose()
        }
        this._disposables = []
    }
}

// Use regex to check if the line
// - a function that starts with a word followed by a {
// - a python def function that starts with or without async
// - a class
const checkIfLineStartsWith = (text: string): boolean => {
    //  || !!line.text.match(/^\s*def\s.*$/)
    // Check if line contains if, for, while, =
    const isArrowFunction = !!text.match(/^\s*.*=>.*$/)
    // Check for line that starts with if, for, while or
    // contains = but not => (arrow function) and ends with {
    const isNotFunction = !!text.match(/^\s*(if|for|while).*$/) || (!!text.match(/.*=.*$/) && !isArrowFunction)
    const isFunction = !!text.match(/^(\s*)?\w.*{$/) && !isNotFunction
    const isPython = !!text.match(/^\s*(async\s*)?def\s.*$/)
    const isClass = !!text.match(/^(export\s*)?class\s.*$/)
    return isFunction || isPython || isClass
}

// Check if the line starts with a word
const checkIfLineStartsWithWord = (text: string): boolean => text.length > 0 && !!text.match(/^\w.*$/)
