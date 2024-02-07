import { isFileURI } from '@sourcegraph/cody-shared'
import * as vscode from 'vscode'

export class KeystrokeTracker implements vscode.Disposable {
    private disposables: vscode.Disposable[] = []
    private counter = 0

    constructor(workspace: Pick<typeof vscode.workspace, 'onDidChangeTextDocument'> = vscode.workspace) {
        this.disposables.push(workspace.onDidChangeTextDocument(this.onDidChangeTextDocument.bind(this)))
    }

    public getKeystrokesSinceLastCall(): number {
        const keystrokes = this.counter
        this.counter = 0
        return keystrokes
    }

    private onDidChangeTextDocument(event: vscode.TextDocumentChangeEvent): void {
        if (!isFileURI(event.document.uri)) {
            return
        }
        for (const change of event.contentChanges) {
            console.log('increment', change.text)
            this.counter += change.text.length
        }
    }

    public dispose(): void {
        for (const disposable of this.disposables) {
            disposable.dispose()
        }
    }
}
