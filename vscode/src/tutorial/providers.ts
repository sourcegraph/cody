import * as vscode from 'vscode'
import { findRangeOfText } from './utils'

export class ChatLinkProvider implements vscode.DocumentLinkProvider {
    constructor(public editor: vscode.TextEditor) {}

    provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentLink[]> {
        if (document.uri.fsPath !== this.editor.document.uri.fsPath) {
            return []
        }

        const linkRange = findRangeOfText(document, 'Start a Chat')
        if (!linkRange) {
            return []
        }

        const decorationType = vscode.window.createTextEditorDecorationType({
            color: new vscode.ThemeColor('textLink.activeForeground'),
        })
        this.editor.setDecorations(decorationType, [{ range: linkRange }])

        return [new vscode.DocumentLink(linkRange, vscode.Uri.parse('command:cody.tutorial.chat'))]
    }
}

export class ResetLensProvider implements vscode.CodeLensProvider {
    private disposables: vscode.Disposable[] = []

    constructor(public editor: vscode.TextEditor) {
        this.disposables.push(vscode.languages.registerCodeLensProvider(editor.document.uri, this))
    }

    provideCodeLenses(document: vscode.TextDocument): vscode.ProviderResult<vscode.CodeLens[]> {
        return [
            new vscode.CodeLens(new vscode.Range(0, 0, 0, 0), {
                title: 'Reset Tutorial',
                command: 'cody.tutorial.reset',
            }),
        ]
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
        this.disposables = []
    }
}
