import * as vscode from 'vscode'
import { getEditor } from '../../editor/active-editor'
import { getDocumentSections } from '../../editor/utils/document-sections'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { isValidTestFile } from '../utils/test-commands'

interface EditorCodeLens {
    name: string
    selection: vscode.Selection
}

/**
 * Adds Code lenses for triggering Command Menu
 */
export class CommandCodeLenses implements vscode.CodeLensProvider {
    private isEnabled = false
    private addTestEnabled = false

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
                telemetryService.log('CodyVSCodeExtension:command:codelens:clicked')
                telemetryRecorder.recordEvent('cody.command.codelens', 'clicked')
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
        this.addTestEnabled = config.get('internal.unstable') as boolean

        if (this.isEnabled && !this._disposables.length) {
            this.init()
        }
        this.fire()
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
        const editor = getEditor()?.active
        if (editor?.document !== document || document.languageId === 'json') {
            return []
        }

        // For test files, adds code lenses for each symbol
        if (this.addTestEnabled && isValidTestFile(document.uri)) {
            return await this.provideCodeLensesForSymbols(document.uri)
        }

        const codeLenses = []
        const linesWithLenses = new Set()

        const smartRanges = await getDocumentSections(document)
        for (const range of smartRanges) {
            if (linesWithLenses.has(range.start)) {
                continue
            }
            const selection = new vscode.Selection(range.start, range.end)
            codeLenses.push(
                new vscode.CodeLens(range, {
                    ...commandLenses.cody,
                    arguments: [{ name: 'cody.menu.commands', selection }],
                })
            )

            linesWithLenses.add(range.start.line)
        }

        return codeLenses
    }

    private async provideCodeLensesForSymbols(doc: vscode.Uri): Promise<vscode.CodeLens[]> {
        const codeLenses = []
        const linesWithLenses = new Set()

        // Get a list of symbols from the document, filter out symbols that are not functions / classes / methods
        const allSymbols = await vscode.commands.executeCommand<vscode.SymbolInformation[]>(
            'vscode.executeDocumentSymbolProvider',
            doc
        )
        const symbols =
            allSymbols?.filter(
                symbol =>
                    symbol.kind === vscode.SymbolKind.Function ||
                    symbol.kind === vscode.SymbolKind.Class ||
                    symbol.kind === vscode.SymbolKind.Method ||
                    symbol.kind === vscode.SymbolKind.Constructor
            ) ?? []

        for (const symbol of symbols) {
            const range = symbol.location.range
            const startLine = range.start.line
            if (linesWithLenses.has(startLine)) {
                continue
            }

            const selection = new vscode.Selection(startLine, 0, range.end.line + 1, 0)

            codeLenses.push(
                new vscode.CodeLens(range, {
                    ...commandLenses.test,
                    arguments: [{ name: 'cody.command.tests-cases', selection }],
                })
            )

            linesWithLenses.add(startLine)
        }

        return codeLenses
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

const commandLenses = {
    cody: {
        title: '$(cody-logo) Cody',
        command: 'cody.editor.codelens.click',
        tooltip: 'Open command menu',
    },
    test: {
        title: '$(cody-logo) Add More Tests',
        command: 'cody.editor.codelens.click',
        tooltip: 'Generate new test cases',
    },
}
