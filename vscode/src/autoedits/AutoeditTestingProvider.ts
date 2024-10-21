import * as vscode from 'vscode'

const outputChannel = vscode.window.createOutputChannel('Autoedit Testing')

export class AutoeditTestingProvider {
    constructor(ctx: vscode.ExtensionContext) {
        vscode.window.onDidChangeTextEditorSelection(e => {
            if (!e.textEditor.document.uri.toString().includes('-autoedit')) {
                return
            }
            outputChannel.appendLine(e.textEditor.document.uri.toString())
        })
    }
}
