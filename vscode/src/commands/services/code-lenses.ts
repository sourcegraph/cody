import * as vscode from 'vscode'
import { fetchDocumentSymbols } from '../../edit/input/utils'
import { getEditor } from '../../editor/active-editor'
import { telemetryService } from '../../services/telemetry'
import { telemetryRecorder } from '../../services/telemetry-v2'
import { execQueryWrapper } from '../../tree-sitter/query-sdk'
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

        let lens = commandLenses.cody

        // TODO (bee) For test files, adds code lenses for each symbol
        if (this.addTestEnabled && isValidTestFile(document.uri)) {
            lens = commandLenses.test
        }

        // Get a list of symbols from the document, filter out symbols that are not functions / classes / methods
        const allSymbols = await fetchDocumentSymbols(document)
        const topLevels = [vscode.SymbolKind.Function, vscode.SymbolKind.Class, vscode.SymbolKind.Method]
        const symbols = allSymbols?.filter(s => topLevels.includes(s.kind))

        const codeLenses = []
        const linesWithLenses = new Set()

        for (const { range } of symbols) {
            if (linesWithLenses.has(range.start.line)) {
                continue
            }

            const [documentableNode] = execQueryWrapper({
                document,
                position: range.start,
                queryWrapper: 'getDocumentableNode',
            })

            if (documentableNode.range?.node?.startPosition?.row !== range.start.line) {
                continue
            }

            codeLenses.push(
                new vscode.CodeLens(range, {
                    ...lens,
                    command: 'cody.editor.codelens.click',
                    arguments: [
                        { name: lens.command, selection: new vscode.Selection(range.start, range.end) },
                    ],
                })
            )
            linesWithLenses.add(range.start.line)
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
        command: 'cody.menu.commands',
        tooltip: 'Open command menu',
    },
    test: {
        title: '$(cody-logo) Add More Tests',
        command: 'cody.command.tests-cases',
        tooltip: 'Generate new test cases',
    },
}
