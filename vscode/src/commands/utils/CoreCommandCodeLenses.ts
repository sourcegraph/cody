import path from 'path'

import * as vscode from 'vscode'

import { doesFileExist } from '@sourcegraph/cody-shared/src/chat/prompts/vscode-context/helpers'

interface EditorCodeLens {
    name: string
    selection: vscode.Selection
}

export class CoreCommandCodeLenses implements vscode.CodeLensProvider {
    private runningTestCommands: Map<string, vscode.Range> = new Map()
    private _disposables: vscode.Disposable[] = []
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    constructor() {
        this.provideCodeLenses = this.provideCodeLenses.bind(this)
        this._disposables.push(
            vscode.commands.registerCommand('cody.workspace.actions.click', async lens => {
                const clickedLens = lens as EditorCodeLens
                await this.onCodeLensClick(clickedLens)
            })
        )

        this._disposables.push(
            vscode.window.onDidChangeVisibleTextEditors(() => this.fire()),
            vscode.window.onDidChangeActiveTextEditor(e => e?.document && this.update(e?.document?.fileName))
        )
    }

    public init(): void {
        this._disposables.push(vscode.languages.registerCodeLensProvider({ scheme: '*' }, this))
    }

    public addCommand(filePath: string, range: vscode.Range): void {
        // remove everything that is not a number or alphabet
        const strippedFileName = this.getStoreName(filePath)
        this.runningTestCommands.set(strippedFileName, range)
        this.fire()
    }

    public removeCommand(filePath: string): void {
        const storeName = this.getStoreName(filePath)
        if (this.runningTestCommands.has(storeName)) {
            this.runningTestCommands.delete(storeName)
            this.fire()
        }
    }

    private getStoreName(filePath: string): string {
        return filePath.replaceAll('test', '').replaceAll(/[^\dA-Za-z]/g, '')
    }

    private update(filePath: string): void {
        if (this.isTestFile(filePath)) {
            this.removeCommand(filePath)
        }
    }

    private isTestFile(filePath: string): boolean {
        const strippedName = filePath.replaceAll(/[^\dA-Za-z]/g, '')
        const storeName = filePath.replaceAll('test', '').replaceAll(/[^\dA-Za-z]/g, '')
        return strippedName !== storeName
    }

    public async provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): Promise<vscode.CodeLens[]> {
        token.onCancellationRequested(() => [])
        const strippedFileName = this.getStoreName(document.fileName)
        const currentCursorPosition = this.runningTestCommands.get(strippedFileName)
        if (document.uri.scheme !== 'untitled') {
            if (currentCursorPosition) {
                return [
                    new vscode.CodeLens(currentCursorPosition, {
                        ...editorCodeLenses.cody,
                        arguments: [{ name: 'cody.action.commands.menu' }],
                    }),
                ]
            }
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
                symbol.kind === vscode.SymbolKind.Method
        )

        // This should always be true because code lenses show up in editor only
        const testFilePath = document.uri.fsPath
        const isFileExists = await doesFileExist(vscode.Uri.file(testFilePath))
        const testFileName = path.basename(testFilePath) || 'file'

        // Add code lenses for each symbol
        if (symbols) {
            for (const symbol of symbols) {
                const range = symbol.location.range
                const selection = new vscode.Selection(range.start, range.end)
                if (isFileExists) {
                    codeLenses.push(
                        new vscode.CodeLens(range, {
                            ...editorCodeLenses.add,
                            title: `Add new test to ${testFileName}`,
                            arguments: [{ name: 'cody.inline.new', selection }],
                        })
                    )
                }
                codeLensesMap.set(symbol.location.range.start.line.toString(), range)
            }
        }

        return codeLenses
    }

    private async onCodeLensClick(lens: EditorCodeLens): Promise<void> {
        // Update selection in active editor to the selection of the clicked code lens
        const activeEditor = vscode.window.activeTextEditor
        if (activeEditor) {
            activeEditor.selection = lens.selection
        }
        await vscode.commands.executeCommand(lens.name, 'codeLens')
    }

    public fire(): void {
        this._onDidChangeCodeLenses.fire()
    }

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
    cody: {
        title: '$(sync~spin) Generating unit tests...',
        command: 'cody.workspace.actions.click',
        tooltip: 'Generating Unit Tests...',
    },
    add: { title: 'Add new test to', command: 'cody.workspace.actions.click', tooltip: 'Add test to test file' },
}

export const commandLenses = new CoreCommandCodeLenses()
