import * as vscode from 'vscode'

import { getEditor } from './active-editor'

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
            vscode.window.onDidChangeActiveTextEditor(() => this.fire())
        )
    }

    /**
     * Update the configurations
     */
    private updateConfig(): void {
        const config = vscode.workspace.getConfiguration('cody')
        this.isEnabled = config.get('commandCodeLenses') as boolean

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
        const activeEditor = getEditor().active
        if (activeEditor) {
            activeEditor.selection = lens.selection
        }
        await vscode.commands.executeCommand(lens.name, 'codeLens')
    }
    /**
     * Gets the code lenses for the specified document.
     */
    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        if (!this.isEnabled) {
            return []
        }
        token.onCancellationRequested(() => [])
        const editor = getEditor().active
        if (!editor || editor.document !== document || document.languageId === 'json') {
            return []
        }
        // Generate code lenses for the document.
        const codeLenses = []
        const codeLensesMap = new Map<string, vscode.Range>()

        // Get a list of symbols from the document, filter out symbols that are not functions / classes / methods
        const allSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            document.uri
        )
        const symbols = allSymbols?.filter(
            symbol =>
                symbol.kind === vscode.SymbolKind.Function ||
                symbol.kind === vscode.SymbolKind.Class ||
                symbol.kind === vscode.SymbolKind.Method ||
                symbol.kind === vscode.SymbolKind.Constructor
        )

        // Add code lenses for each symbol
        if (symbols) {
            for (const symbol of symbols) {
                const range = symbol.location.range
                const selection = new vscode.Selection(range.start, range.end)
                codeLenses.push(
                    new vscode.CodeLens(range, {
                        ...editorCodeLenses.cody,
                        arguments: [{ name: 'cody.action.commands.menu', selection }],
                    })
                )
                codeLensesMap.set(symbol.location.range.start.line.toString(), range)
            }
        }

        return codeLenses
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
        if (this._disposables.length) {
            for (const disposable of this._disposables) {
                disposable.dispose()
            }
            this._disposables = []
        }
        this._onDidChangeCodeLenses.fire()
    }
}

const editorCodeLenses = {
    cody: { title: '$(cody-logo) Cody', command: 'cody.editor.codelens.click', tooltip: 'Open command menu' },
    inline: { title: 'Inline Chat', command: 'cody.editor.codelens.click', tooltip: 'Ask Cody inline' },
}
