import * as vscode from 'vscode'
import type { TutorialSource } from './commands'
import { findRangeOfText } from './utils'

export class TutorialLinkProvider implements vscode.DocumentLinkProvider {
    constructor(public editor: vscode.TextEditor) {}

    provideDocumentLinks(
        document: vscode.TextDocument,
        token: vscode.CancellationToken
    ): vscode.ProviderResult<vscode.DocumentLink[]> {
        if (document.uri.fsPath !== this.editor.document.uri.fsPath) {
            return []
        }

        const links: vscode.DocumentLink[] = []

        const editRange = findRangeOfText(document, 'Start an Edit')
        if (editRange) {
            const params = [document, 'link' satisfies TutorialSource]
            links.push(
                new vscode.DocumentLink(
                    editRange,
                    vscode.Uri.parse(
                        `command:cody.tutorial.edit?${encodeURIComponent(JSON.stringify(params))}`
                    )
                )
            )
        }

        const chatRange = findRangeOfText(document, 'Start a Chat')
        if (chatRange) {
            const params = [document, 'link' satisfies TutorialSource]
            links.push(
                new vscode.DocumentLink(
                    chatRange,
                    vscode.Uri.parse(
                        `command:cody.tutorial.chat?${encodeURIComponent(JSON.stringify(params))}`
                    )
                )
            )
        }

        const linkDecoration = vscode.window.createTextEditorDecorationType({
            color: new vscode.ThemeColor('textLink.activeForeground'),
        })
        this.editor.setDecorations(linkDecoration, links)

        return links
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
