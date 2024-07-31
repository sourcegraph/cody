import * as vscode from 'vscode'
import Parser from 'web-tree-sitter'

export type RefactorItem = { node: Parser.SyntaxNode; id: string; state: 'idle' | 'inProgress' | 'done' }

export class RefactorCodeLensProvider implements vscode.CodeLensProvider, vscode.Disposable {
    private codeLenses: vscode.CodeLens[] = []
    private regex: RegExp
    private curentDocument: vscode.TextDocument | undefined
    private currentItems: RefactorItem[] | undefined
    private _onDidChangeCodeLenses: vscode.EventEmitter<void> = new vscode.EventEmitter<void>()
    public readonly onDidChangeCodeLenses: vscode.Event<void> = this._onDidChangeCodeLenses.event

    private disposables: vscode.Disposable[] = []

    constructor() {
        this.regex = /\.example$/
        this.disposables.push(vscode.languages.registerCodeLensProvider({ scheme: 'file' }, this))
    }

    public showCodeLenses(document: vscode.TextDocument, items: RefactorItem[]) {
        this.currentDocument = document
        this.currentItems = items
        this._onDidChangeCodeLenses.fire()
    }

    public updateItemState(id: string, state: 'idle' | 'inProgress' | 'done') {
        if (!this.currentItems) {
            return
        }

        const item = this.currentItems.find(i => i.id === id)
        if (!item) {
            return
        }
        item.state = state
        this._onDidChangeCodeLenses.fire()
    }

    public provideCodeLenses(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.CodeLens[] | Thenable<vscode.CodeLens[]> {
        this.codeLenses = []

        // const text = document.getText()
        // const lines = text.split('\n')

        // for (let i = 0; i < lines.length; i++) {
        //     const line = lines[i]
        //     const match = this.regex.exec(line)

        //     if (match) {
        //         const range = new vscode.Range(i, 0, i, line.length)
        //         const command: vscode.Command = {
        //             title: 'Example Code Lens',
        //             command: 'extension.exampleCommand',
        //             arguments: [document, range],
        //         }
        //         const codeLens = new vscode.CodeLens(range, command)
        //         this.codeLenses.push(codeLens)
        //     }
        // }
        if (!this.currentItems) {
            return this.codeLenses
        }

        this.codeLenses = this.currentItems.map(item => {
            const { node, state, id } = item
            const nodeRange = new vscode.Range(
                new vscode.Position(node.startPosition.row, node.startPosition.column),
                new vscode.Position(node.endPosition.row, node.endPosition.column)
            )

            const icon = state === 'inProgress' ? '$(sync~spin)' : '$(cody-logo)'
            const titleText =
                state === 'inProgress'
                    ? 'Cody is working...'
                    : 'Refactor function calls to match the new call signature'

            const command: vscode.Command = {
                title: `${icon} ${titleText}`,
                command: 'cody.command.updateCallsites',
                arguments: [document, nodeRange, id],
            }

            const codeLens = new vscode.CodeLens(nodeRange, command)

            return codeLens
        })

        return this.codeLenses
    }

    public resolveCodeLens(codeLens: vscode.CodeLens, token: vscode.CancellationToken) {
        // Optionally, you can provide additional information or modify the code lens here
        return codeLens
    }

    public dispose() {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}

export const refactorCodeLensProvider = new RefactorCodeLensProvider()
